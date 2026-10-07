import { fbm3, noise3, sdCappedCone, sdEllipsoid, sdRoundBox, sdRoundCone, sdSphere, sdTorus, smax, smin, type V3 } from './sdf';

/**
 * Pure meshing pipeline for sculpted creatures (no three.js, no DOM), so it can run in a Web Worker:
 * sparse SDF evaluation → surface nets → Taubin smoothing → per-vertex normals, materials and
 * automatic skin weights.
 */

export type Shape =
  | { t: 'sphere'; c: V3; r: number }
  | { t: 'ell'; c: V3; r: V3 }
  | { t: 'cone'; a: V3; b: V3; r1: number; r2: number }
  | { t: 'box'; c: V3; half: V3; round: number; ry: number; rx: number }
  | { t: 'ccone'; c: V3; h: number; r1: number; r2: number }
  | { t: 'torus'; c: V3; R: number; r: number }
  /** Ellipsoid with an arbitrary orientation (basis vectors u, v, w; half-axes r). */
  | { t: 'oell'; c: V3; u: V3; v: V3; w: V3; r: V3 };

export interface Relief {
  /** Displacement amplitude in metres (kept small: it bends the distance field). */
  amp: number;
  freq: number;
  mode: 'lumps' | 'grooves' | 'folds' | 'cracks' | 'ridges';
}

export interface PrimSurface {
  color: V3;
  rough: number;
  detail: number;
  emissive: V3;
  hard: boolean;
}

export interface Prim {
  shape: Shape;
  op: 'add' | 'sub' | 'paint';
  k: number;
  bone: number;
  surf: PrimSurface;
  relief?: Relief;
  min: V3;
  max: V3;
  /** Paint volumes may also change the surface detail family (e.g. leather painted on skin). */
  paintDetail?: boolean;
}

export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  rough: Float32Array;
  detail: Float32Array;
  emissive: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  ms: number;
}

export function shapeBounds(s: Shape): [V3, V3] {
  switch (s.t) {
    case 'sphere':
      return [
        [s.c[0] - s.r, s.c[1] - s.r, s.c[2] - s.r],
        [s.c[0] + s.r, s.c[1] + s.r, s.c[2] + s.r],
      ];
    case 'ell':
      return [
        [s.c[0] - s.r[0], s.c[1] - s.r[1], s.c[2] - s.r[2]],
        [s.c[0] + s.r[0], s.c[1] + s.r[1], s.c[2] + s.r[2]],
      ];
    case 'cone': {
      const r = Math.max(s.r1, s.r2);
      return [
        [Math.min(s.a[0], s.b[0]) - r, Math.min(s.a[1], s.b[1]) - r, Math.min(s.a[2], s.b[2]) - r],
        [Math.max(s.a[0], s.b[0]) + r, Math.max(s.a[1], s.b[1]) + r, Math.max(s.a[2], s.b[2]) + r],
      ];
    }
    case 'box': {
      const r = Math.hypot(s.half[0], s.half[1], s.half[2]);
      return [
        [s.c[0] - r, s.c[1] - r, s.c[2] - r],
        [s.c[0] + r, s.c[1] + r, s.c[2] + r],
      ];
    }
    case 'ccone': {
      const r = Math.max(s.r1, s.r2);
      return [
        [s.c[0] - r, s.c[1] - s.h, s.c[2] - r],
        [s.c[0] + r, s.c[1] + s.h, s.c[2] + r],
      ];
    }
    case 'torus':
      return [
        [s.c[0] - s.R - s.r, s.c[1] - s.r, s.c[2] - s.R - s.r],
        [s.c[0] + s.R + s.r, s.c[1] + s.r, s.c[2] + s.R + s.r],
      ];
    case 'oell': {
      const r = Math.max(s.r[0], s.r[1], s.r[2]);
      return [
        [s.c[0] - r, s.c[1] - r, s.c[2] - r],
        [s.c[0] + r, s.c[1] + r, s.c[2] + r],
      ];
    }
  }
}

function shapeDist(s: Shape, x: number, y: number, z: number): number {
  switch (s.t) {
    case 'sphere':
      return sdSphere(x, y, z, s.c, s.r);
    case 'ell':
      return sdEllipsoid(x, y, z, s.c, s.r);
    case 'cone':
      return sdRoundCone(x, y, z, s.a, s.b, s.r1, s.r2);
    case 'box':
      return sdRoundBox(x, y, z, s.c, s.half, s.round, s.ry, s.rx);
    case 'ccone':
      return sdCappedCone(x, y, z, s.c, s.h, s.r1, s.r2);
    case 'torus':
      return sdTorus(x, y, z, s.c, s.R, s.r);
    case 'oell': {
      const dx = x - s.c[0];
      const dy = y - s.c[1];
      const dz = z - s.c[2];
      const a = dx * s.u[0] + dy * s.u[1] + dz * s.u[2];
      const b = dx * s.v[0] + dy * s.v[1] + dz * s.v[2];
      const c = dx * s.w[0] + dy * s.w[1] + dz * s.w[2];
      return sdEllipsoid(a, b, c, [0, 0, 0], s.r);
    }
  }
}

function relief(r: Relief | undefined, x: number, y: number, z: number): number {
  if (!r) return 0;
  const f = r.freq;
  switch (r.mode) {
    case 'lumps':
      return (fbm3(x * f, y * f, z * f, 3) - 0.5) * 2 * r.amp;
    case 'grooves': {
      // Vertical bark-like grooves.
      const n = fbm3(x * f, y * f * 0.18, z * f, 3);
      return (Math.abs(n - 0.5) * 2 - 0.35) * r.amp;
    }
    case 'folds': {
      // Hanging cloth folds.
      const n = noise3(x * f, y * f * 0.12, z * f) + 0.5 * noise3(x * f * 2.1, y * f * 0.2, z * f * 2.1);
      return (n / 1.5 - 0.5) * 2 * r.amp;
    }
    case 'cracks': {
      const n = fbm3(x * f, y * f, z * f, 2);
      return -Math.max(0, 1 - Math.abs(n - 0.5) * 18) * r.amp + (noise3(x * f * 3, y * f * 3, z * f * 3) - 0.5) * r.amp * 0.5;
    }
    case 'ridges': {
      const n = noise3(x * f, y * f, z * f);
      return (1 - Math.abs(n * 2 - 1)) * r.amp - r.amp * 0.5;
    }
  }
}

/** Squared distance from a point to a primitive's bounding box. */
function aabbDist2(p: Prim, x: number, y: number, z: number): number {
  const dx = Math.max(p.min[0] - x, 0, x - p.max[0]);
  const dy = Math.max(p.min[1] - y, 0, y - p.max[1]);
  const dz = Math.max(p.min[2] - z, 0, z - p.max[2]);
  return dx * dx + dy * dy + dz * dz;
}

function aabbDist(p: Prim, x: number, y: number, z: number): number {
  return Math.sqrt(aabbDist2(p, x, y, z));
}

function sdf(x: number, y: number, z: number, list: Prim[]): number {
  let d = 1e9;
  for (const p of list) {
    if (p.op === 'paint') continue;
    const amp = p.relief?.amp ?? 0;
    if (p.op === 'add') {
      // Skip shapes whose bounds are already too far to change the blend (compared squared).
      const lim = d + p.k + amp;
      if (lim <= 0 || aabbDist2(p, x, y, z) >= lim * lim) continue;
      const dd = shapeDist(p.shape, x, y, z) + relief(p.relief, x, y, z);
      d = smin(d, dd, p.k);
    } else {
      if (aabbDist2(p, x, y, z) > p.k * p.k) continue;
      const dd = shapeDist(p.shape, x, y, z);
      d = smax(d, -dd, p.k);
    }
  }
  return d;
}

/** Taubin λ|μ smoothing: smooths voxel stair-steps without shrinking the shape. */
function taubin(pos: number[], indices: number[], vcount: number, iterations: number): void {
  const deg = new Uint32Array(vcount);
  for (const i of indices) deg[i] = (deg[i] as number) + 2;
  const start = new Uint32Array(vcount + 1);
  for (let v = 0; v < vcount; v++) start[v + 1] = (start[v] as number) + (deg[v] as number);
  const fill = start.slice(0, vcount);
  const nb = new Uint32Array(start[vcount] as number);
  const link = (a: number, b: number): void => {
    nb[fill[a] as number] = b;
    fill[a] = (fill[a] as number) + 1;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] as number;
    const b = indices[i + 1] as number;
    const c = indices[i + 2] as number;
    link(a, b);
    link(a, c);
    link(b, a);
    link(b, c);
    link(c, a);
    link(c, b);
  }
  const tmp = new Float64Array(pos.length);
  for (let it = 0; it < iterations; it++) {
    for (const factor of [0.5, -0.53]) {
      for (let v = 0; v < vcount; v++) {
        const s0 = start[v] as number;
        const s1 = start[v + 1] as number;
        for (let c = 0; c < 3; c++) tmp[v * 3 + c] = pos[v * 3 + c] as number;
        if (s1 === s0) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        for (let q = s0; q < s1; q++) {
          const n = nb[q] as number;
          ax += pos[n * 3] as number;
          ay += pos[n * 3 + 1] as number;
          az += pos[n * 3 + 2] as number;
        }
        const inv = 1 / (s1 - s0);
        tmp[v * 3] = (pos[v * 3] as number) + factor * (ax * inv - (pos[v * 3] as number));
        tmp[v * 3 + 1] = (pos[v * 3 + 1] as number) + factor * (ay * inv - (pos[v * 3 + 1] as number));
        tmp[v * 3 + 2] = (pos[v * 3 + 2] as number) + factor * (az * inv - (pos[v * 3 + 2] as number));
      }
      for (let q = 0; q < pos.length; q++) pos[q] = tmp[q] as number;
    }
  }
}

const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Optional restriction of a meshing pass: `region` meshes only inside a box (used for a
 * high-resolution head), `exclude` drops faces inside a box (the body pass around that head).
 */
export interface MeshRegion {
  region?: [V3, V3];
  exclude?: [V3, V3];
}

const inBox = (b: [V3, V3], x: number, y: number, z: number): boolean => x > b[0][0] && x < b[1][0] && y > b[0][1] && y < b[1][1] && z > b[0][2] && z < b[1][2];

export function meshPrims(prims: Prim[], boneCount: number, voxel: number, opts: MeshRegion = {}): MeshData {
  const t0 = performance.now();
  const adds = prims.filter((p) => p.op === 'add');
  const lo: V3 = [1e9, 1e9, 1e9];
  const hi: V3 = [-1e9, -1e9, -1e9];
  for (const p of adds) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i] as number, (p.min[i] as number) - (p.relief?.amp ?? 0));
      hi[i] = Math.max(hi[i] as number, (p.max[i] as number) + (p.relief?.amp ?? 0));
    }
  }
  if (opts.region) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.max(lo[i] as number, opts.region[0][i] as number);
      hi[i] = Math.min(hi[i] as number, opts.region[1][i] as number);
    }
  }
  const pad = voxel * 2;
  const nx = Math.ceil(((hi[0] as number) - (lo[0] as number) + pad * 2) / voxel) + 1;
  const ny = Math.ceil(((hi[1] as number) - (lo[1] as number) + pad * 2) / voxel) + 1;
  const nz = Math.ceil(((hi[2] as number) - (lo[2] as number) + pad * 2) / voxel) + 1;
  const ox = (lo[0] as number) - pad;
  const oy = (lo[1] as number) - pad;
  const oz = (lo[2] as number) - pad;
  const values = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number): number => i + nx * (j + ny * k);

  // Spatial bucketing: each block only evaluates the shapes that can influence it.
  const B = 6;
  const hd = (B * voxel * Math.sqrt(3)) / 2;
  const geomPrims = prims.filter((p) => p.op !== 'paint');
  const paints = prims.filter((p) => p.op === 'paint');
  const maxK = geomPrims.reduce((m, p) => Math.max(m, p.k + (p.relief?.amp ?? 0)), 0);
  const reach = hd * 2.2 + maxK + voxel * 2;
  const nbx = Math.ceil(nx / B);
  const nby = Math.ceil(ny / B);
  const nbz = Math.ceil(nz / B);
  const blockLists: Prim[][] = new Array(nbx * nby * nbz);
  const listFor = (bx: number, by: number, bz: number): Prim[] => {
    const key = bx + nbx * (by + nby * bz);
    let list = blockLists[key];
    if (list) return list;
    const x0 = ox + bx * B * voxel - reach;
    const y0 = oy + by * B * voxel - reach;
    const z0 = oz + bz * B * voxel - reach;
    const x1 = ox + (bx + 1) * B * voxel + reach;
    const y1 = oy + (by + 1) * B * voxel + reach;
    const z1 = oz + (bz + 1) * B * voxel + reach;
    list = geomPrims.filter((p) => p.max[0] >= x0 && p.min[0] <= x1 && p.max[1] >= y0 && p.min[1] <= y1 && p.max[2] >= z0 && p.min[2] <= z1);
    blockLists[key] = list;
    return list;
  };
  const listAt = (x: number, y: number, z: number): Prim[] =>
    listFor(
      Math.min(nbx - 1, Math.max(0, Math.floor((x - ox) / voxel / B))),
      Math.min(nby - 1, Math.max(0, Math.floor((y - oy) / voxel / B))),
      Math.min(nbz - 1, Math.max(0, Math.floor((z - oz) / voxel / B))),
    );
  // Sparse evaluation: blocks far from the surface are filled without per-point evaluation.
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        const ie = Math.min(nx, bi + B + 1);
        const je = Math.min(ny, bj + B + 1);
        const ke = Math.min(nz, bk + B + 1);
        const list = listFor(bi / B, bj / B, bk / B);
        if (list.length === 0) {
          for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++) values[idx(i, j, k)] = reach;
          continue;
        }
        const cx = ox + ((bi + ie - 1) / 2) * voxel;
        const cy = oy + ((bj + je - 1) / 2) * voxel;
        const cz = oz + ((bk + ke - 1) / 2) * voxel;
        const dc = sdf(cx, cy, cz, list);
        if (Math.abs(dc) > hd * 1.6 + voxel) {
          for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++) values[idx(i, j, k)] = dc;
          continue;
        }
        for (let k = bk; k < ke; k++) {
          for (let j = bj; j < je; j++) {
            for (let i = bi; i < ie; i++) values[idx(i, j, k)] = sdf(ox + i * voxel, oy + j * voxel, oz + k * voxel, list);
          }
        }
      }
    }
  }

  // Surface nets: one vertex per surface-crossing cell, one quad per surface-crossing edge.
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number): number => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = values[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))] as number;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a] as number;
          const vb = corner[b] as number;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellIndex[cidx(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * voxel, oy + (j + sy / n) * voxel, oz + (k + sz / n) * voxel);
      }
    }
  }
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = values[idx(i, j, k)] as number;
        const inside = v0 < 0;
        if (inside !== (values[idx(i + 1, j, k)] as number) < 0) {
          quad(cellIndex[cidx(i, j - 1, k - 1)] as number, cellIndex[cidx(i, j, k - 1)] as number, cellIndex[cidx(i, j, k)] as number, cellIndex[cidx(i, j - 1, k)] as number, inside);
        }
        if (inside !== (values[idx(i, j + 1, k)] as number) < 0) {
          quad(cellIndex[cidx(i - 1, j, k - 1)] as number, cellIndex[cidx(i - 1, j, k)] as number, cellIndex[cidx(i, j, k)] as number, cellIndex[cidx(i, j, k - 1)] as number, inside);
        }
        if (inside !== (values[idx(i, j, k + 1)] as number) < 0) {
          quad(cellIndex[cidx(i - 1, j - 1, k)] as number, cellIndex[cidx(i, j - 1, k)] as number, cellIndex[cidx(i, j, k)] as number, cellIndex[cidx(i - 1, j, k)] as number, inside);
        }
      }
    }
  }

  // Taubin smoothing (shrink-free): removes voxel stair-steps on thin parts like ears and fins.
  taubin(pos, indices, pos.length / 3, 2);

  // Drop faces handed to another (finer) pass, then compact the vertices still in use.
  if (opts.exclude) {
    const ex = opts.exclude;
    const kept: number[] = [];
    for (let t = 0; t < indices.length; t += 3) {
      const a = (indices[t] as number) * 3;
      const b = (indices[t + 1] as number) * 3;
      const c = (indices[t + 2] as number) * 3;
      const cx = ((pos[a] as number) + (pos[b] as number) + (pos[c] as number)) / 3;
      const cy = ((pos[a + 1] as number) + (pos[b + 1] as number) + (pos[c + 1] as number)) / 3;
      const cz = ((pos[a + 2] as number) + (pos[b + 2] as number) + (pos[c + 2] as number)) / 3;
      if (!inBox(ex, cx, cy, cz)) kept.push(indices[t] as number, indices[t + 1] as number, indices[t + 2] as number);
    }
    const remap = new Int32Array(pos.length / 3).fill(-1);
    const compact: number[] = [];
    for (let t = 0; t < kept.length; t++) {
      const v = kept[t] as number;
      if (remap[v] === -1) {
        remap[v] = compact.length / 3;
        compact.push(pos[v * 3] as number, pos[v * 3 + 1] as number, pos[v * 3 + 2] as number);
      }
      kept[t] = remap[v] as number;
    }
    pos.length = 0;
    for (const v of compact) pos.push(v);
    indices.length = 0;
    for (const i of kept) indices.push(i);
  }
  const vcount = pos.length / 3;

  // Per-vertex normals (SDF gradient), materials and skin weights.
  const normals = new Float32Array(vcount * 3);
  const colors = new Float32Array(vcount * 3);
  const rough = new Float32Array(vcount);
  const detail = new Float32Array(vcount);
  const emissive = new Float32Array(vcount * 3);
  const skinIndex = new Uint16Array(vcount * 4);
  const skinWeight = new Float32Array(vcount * 4);
  const e = voxel * 0.5;
  const boneW = new Float32Array(boneCount);
  const falloff = Math.max(0.025, voxel * 1.5);
  const near: { p: Prim; d: number }[] = [];
  for (let v = 0; v < vcount; v++) {
    const x = pos[v * 3] as number;
    const y = pos[v * 3 + 1] as number;
    const z = pos[v * 3 + 2] as number;
    const local = listAt(x, y, z);
    let gx = sdf(x + e, y, z, local) - sdf(x - e, y, z, local);
    let gy = sdf(x, y + e, z, local) - sdf(x, y - e, z, local);
    let gz = sdf(x, y, z + e, local) - sdf(x, y, z - e, local);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    normals[v * 3] = gx;
    normals[v * 3 + 1] = gy;
    normals[v * 3 + 2] = gz;
    // Material & bone influence from nearby shapes.
    let dmin = 1e9;
    let nearest: Prim | null = null;
    let paintDetail = -1;
    near.length = 0;
    for (const p of local) {
      if (p.op !== 'add' || aabbDist(p, x, y, z) > falloff * 6) continue;
      const d = Math.abs(shapeDist(p.shape, x, y, z) + relief(p.relief, x, y, z));
      near.push({ p, d });
      if (d < dmin) {
        dmin = d;
        nearest = p;
      }
    }
    boneW.fill(0);
    let cr = 0;
    let cg = 0;
    let cb = 0;
    let er = 0;
    let eg = 0;
    let eb = 0;
    let wsum = 0;
    let r = 0;
    const hardNearest = nearest?.surf.hard ?? false;
    // Edges between garments, hair and skin stay crisp: hard surfaces only mix within a narrow
    // band (an antialiased edge), soft tissue blends smoothly with soft tissue.
    const edge = Math.max(0.002, voxel * 0.35);
    for (const { p, d } of near) {
      const w = Math.exp(-(d - dmin) / falloff);
      if (w < 0.02) continue;
      boneW[p.bone] = (boneW[p.bone] as number) + w;
      const crisp = hardNearest || p.surf.hard;
      const wc = crisp ? Math.exp(-(d - dmin) / edge) : w;
      if (wc < 0.01) continue;
      wsum += wc;
      cr += p.surf.color[0] * wc;
      cg += p.surf.color[1] * wc;
      cb += p.surf.color[2] * wc;
      er += p.surf.emissive[0] * wc;
      eg += p.surf.emissive[1] * wc;
      eb += p.surf.emissive[2] * wc;
      r += p.surf.rough * wc;
    }
    if (wsum > 0) {
      cr /= wsum;
      cg /= wsum;
      cb /= wsum;
      er /= wsum;
      eg /= wsum;
      eb /= wsum;
      r /= wsum;
    }
    // Paint volumes override colour softly.
    for (const p of paints) {
      if (aabbDist(p, x, y, z) > p.k) continue;
      const d = shapeDist(p.shape, x, y, z);
      if (d > p.k) continue;
      const t = Math.min(1, Math.max(0, 1 - (d + p.k) / (2 * p.k)));
      cr += (p.surf.color[0] - cr) * t;
      cg += (p.surf.color[1] - cg) * t;
      cb += (p.surf.color[2] - cb) * t;
      if (p.surf.emissive[0] + p.surf.emissive[1] + p.surf.emissive[2] > 0) {
        er += (p.surf.emissive[0] - er) * t;
        eg += (p.surf.emissive[1] - eg) * t;
        eb += (p.surf.emissive[2] - eb) * t;
      }
      r += (p.surf.rough - r) * t;
      if (t > 0.5 && p.paintDetail) paintDetail = p.surf.detail;
    }
    // Subtle organic colour variation.
    const nv = 0.86 + fbm3(x * 9, y * 9, z * 9, 2) * 0.28;
    colors[v * 3] = cr * nv;
    colors[v * 3 + 1] = cg * nv;
    colors[v * 3 + 2] = cb * nv;
    emissive[v * 3] = er;
    emissive[v * 3 + 1] = eg;
    emissive[v * 3 + 2] = eb;
    rough[v] = r || 0.7;
    detail[v] = paintDetail >= 0 ? paintDetail : nearest ? nearest.surf.detail : 0;
    // Top-4 bones.
    let bs = 0;
    for (let slot = 0; slot < 4; slot++) {
      let best = -1;
      let bw = 0;
      for (let b = 0; b < boneCount; b++) {
        const w = boneW[b] as number;
        if (w > bw) {
          bw = w;
          best = b;
        }
      }
      if (best < 0) break;
      skinIndex[v * 4 + slot] = best;
      skinWeight[v * 4 + slot] = bw;
      bs += bw;
      boneW[best] = 0;
    }
    if (bs > 0) for (let slot = 0; slot < 4; slot++) skinWeight[v * 4 + slot] = (skinWeight[v * 4 + slot] as number) / bs;
    else skinWeight[v * 4] = 1;
  }

  return {
    position: new Float32Array(pos),
    normal: normals,
    color: colors,
    rough,
    detail,
    emissive,
    skinIndex,
    skinWeight,
    index: new Uint32Array(indices),
    ms: performance.now() - t0,
  };
}
