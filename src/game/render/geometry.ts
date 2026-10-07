import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

/**
 * Accumulates triangles from many pieces into a single BufferGeometry.
 * Much faster than creating hundreds of geometries and merging them.
 */
export class GeometryAccumulator {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  private hasColor = false;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /**
   * Appends a geometry transformed by `matrix`.
   * @param uvScale when set, replaces UVs with world-space triplanar UVs (metres / uvScale).
   */
  append(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, uvScale?: number, color?: THREE.Color): void {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const base = this.vertexCount;
    _m3.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.positions.push(_v.x, _v.y, _v.z);
      if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
      else _n.set(0, 1, 0);
      this.normals.push(_n.x, _n.y, _n.z);
      if (uvScale) {
        const ax = Math.abs(_n.x);
        const ay = Math.abs(_n.y);
        const az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) this.uvs.push(_v.x / uvScale, _v.z / uvScale);
        else if (ax >= az) this.uvs.push(_v.z / uvScale, _v.y / uvScale);
        else this.uvs.push(_v.x / uvScale, _v.y / uvScale);
      } else if (uv) {
        this.uvs.push(uv.getX(i), uv.getY(i));
      } else {
        this.uvs.push(0, 0);
      }
      if (color) {
        this.hasColor = true;
        this.colors.push(color.r, color.g, color.b);
      } else {
        this.colors.push(1, 1, 1);
      }
    }
    const index = geo.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) this.indices.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.indices.push(base + i);
    }
  }

  /** Adds a subdivided quad grid. `fn(s, t)` returns the world position for s, t ∈ [0, 1]. */
  grid(
    segS: number,
    segT: number,
    fn: (s: number, t: number, out: THREE.Vector3) => void,
    uvFn: (p: THREE.Vector3) => [number, number],
    flip = false,
  ): void {
    const base = this.vertexCount;
    const p = new THREE.Vector3();
    for (let j = 0; j <= segT; j++) {
      for (let i = 0; i <= segS; i++) {
        fn(i / segS, j / segT, p);
        this.positions.push(p.x, p.y, p.z);
        this.normals.push(0, 0, 0);
        const [u, v] = uvFn(p);
        this.uvs.push(u, v);
        this.colors.push(1, 1, 1);
      }
    }
    const row = segS + 1;
    for (let j = 0; j < segT; j++) {
      for (let i = 0; i < segS; i++) {
        const a = base + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (flip) this.indices.push(a, b, c, b, d, c);
        else this.indices.push(a, c, b, b, c, d);
      }
    }
    this.pendingNormals.push([base, this.vertexCount]);
  }

  private pendingNormals: [number, number][] = [];

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.hasColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setIndex(this.indices);
    if (this.pendingNormals.length > 0) recomputeNormalsInRanges(geo, this.pendingNormals);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

/** Computes smooth normals only for vertices in the given ranges (grids), keeping appended normals. */
function recomputeNormalsInRanges(geo: THREE.BufferGeometry, ranges: [number, number][]): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const index = geo.getIndex() as THREE.BufferAttribute;
  const inRange = new Uint8Array(pos.count);
  for (const [a, b] of ranges) for (let i = a; i < b; i++) inRange[i] = 1;
  const acc = new Float32Array(pos.count * 3);
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (!inRange[a]) continue;
    pa.fromBufferAttribute(pos, a);
    pb.fromBufferAttribute(pos, b);
    pc.fromBufferAttribute(pos, c);
    cb.subVectors(pc, pb);
    ab.subVectors(pa, pb);
    cb.cross(ab);
    for (const v of [a, b, c]) {
      acc[v * 3] = (acc[v * 3] as number) + cb.x;
      acc[v * 3 + 1] = (acc[v * 3 + 1] as number) + cb.y;
      acc[v * 3 + 2] = (acc[v * 3 + 2] as number) + cb.z;
    }
  }
  for (let v = 0; v < pos.count; v++) {
    if (!inRange[v]) continue;
    _n.set(acc[v * 3] as number, acc[v * 3 + 1] as number, acc[v * 3 + 2] as number).normalize();
    nor.setXYZ(v, _n.x, _n.y, _n.z);
  }
  nor.needsUpdate = true;
}

/** Groups accumulators by (chunk, material) so the maze can be frustum-culled in pieces. */
export class ChunkedAccumulator {
  private readonly chunks = new Map<string, GeometryAccumulator>();

  constructor(private readonly chunkSize: number) {}

  get(materialKey: string, x: number, z: number): GeometryAccumulator {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${materialKey}|${cx}|${cz}`;
    let acc = this.chunks.get(key);
    if (!acc) {
      acc = new GeometryAccumulator();
      this.chunks.set(key, acc);
    }
    return acc;
  }

  *entries(): Generator<[string, GeometryAccumulator]> {
    for (const [key, acc] of this.chunks) {
      if (acc.vertexCount > 0) yield [key.split('|')[0] as string, acc];
    }
  }
}

/** Semicircular arch frame, centred on x = 0, standing on y = 0, facing ±Z, `depth` thick. */
export function archGeometry(openingWidth: number, springHeight: number, frame: number, depth: number): THREE.BufferGeometry {
  const r = openingWidth / 2;
  const outer = new THREE.Shape();
  const ow = r + frame;
  const top = springHeight + r + frame * 0.9;
  outer.moveTo(-ow, 0);
  outer.lineTo(ow, 0);
  outer.lineTo(ow, top);
  outer.lineTo(-ow, top);
  outer.lineTo(-ow, 0);
  const hole = new THREE.Path();
  hole.moveTo(-r, 0);
  hole.lineTo(-r, springHeight);
  hole.absarc(0, springHeight, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.lineTo(-r, 0);
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 14,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** A rough, slightly irregular rock. */
export function rockGeometry(seed: number, detail = 0): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const k = 0.75 + (s - Math.floor(s)) * 0.45;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
