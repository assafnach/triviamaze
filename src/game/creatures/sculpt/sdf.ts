/**
 * Signed distance functions for procedural sculpting. Shapes are blended with smooth unions into a
 * single continuous organic surface (no visible primitive seams), then meshed by `mesher.ts`.
 * Formulas follow Inigo Quilez's well-known distance-function reference.
 */
export type V3 = [number, number, number];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mirrorX = (a: V3): V3 => [-a[0], a[1], a[2]];

/** Polynomial smooth minimum. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function sdSphere(px: number, py: number, pz: number, c: V3, r: number): number {
  const x = px - c[0];
  const y = py - c[1];
  const z = pz - c[2];
  return Math.sqrt(x * x + y * y + z * z) - r;
}

/** Approximate ellipsoid distance (good near the surface, which is all the mesher needs). */
export function sdEllipsoid(px: number, py: number, pz: number, c: V3, r: V3): number {
  const x = (px - c[0]) / r[0];
  const y = (py - c[1]) / r[1];
  const z = (pz - c[2]) / r[2];
  // (Math.sqrt over Math.hypot: hypot is several times slower and this is the mesher's hot path.)
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / r[0];
  const y1 = y / r[1];
  const z1 = z / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}

/** Tapered capsule from a (radius r1) to b (radius r2) — the workhorse for limbs, horns, tails. */
export function sdRoundCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number): number {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  if (l2 < 1e-12) {
    const dx = px - a[0];
    const dy = py - a[1];
    const dz = pz - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - Math.max(r1, r2);
  }
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0];
  const pay = py - a[1];
  const paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Rounded box with an optional rotation about Y then X (enough for armour plates, teeth, planks). */
export function sdRoundBox(px: number, py: number, pz: number, c: V3, half: V3, round: number, rotY = 0, rotX = 0): number {
  let x = px - c[0];
  let y = py - c[1];
  let z = pz - c[2];
  if (rotY) {
    const cs = Math.cos(rotY);
    const sn = Math.sin(rotY);
    const nx = x * cs - z * sn;
    z = x * sn + z * cs;
    x = nx;
  }
  if (rotX) {
    const cs = Math.cos(rotX);
    const sn = Math.sin(rotX);
    const ny = y * cs - z * sn;
    z = y * sn + z * cs;
    y = ny;
  }
  const qx = Math.abs(x) - half[0] + round;
  const qy = Math.abs(y) - half[1] + round;
  const qz = Math.abs(z) - half[2] + round;
  const mx = Math.max(qx, 0);
  const my = Math.max(qy, 0);
  const mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - round;
}

/** Vertical capped cone (robes, hats, trunks): centre c, half height h, bottom radius r1, top radius r2. */
export function sdCappedCone(px: number, py: number, pz: number, c: V3, h: number, r1: number, r2: number): number {
  const dx = px - c[0];
  const dz = pz - c[2];
  const qx = Math.sqrt(dx * dx + dz * dz);
  const qy = py - c[1];
  const k1x = r2;
  const k1y = h;
  const k2x = r2 - r1;
  const k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2);
  const cay = Math.abs(qy) - h;
  const t = Math.min(1, Math.max(0, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y)));
  const cbx = qx - k1x + k2x * t;
  const cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

/** Torus lying in the XZ plane (rings, bands, ear rims). */
export function sdTorus(px: number, py: number, pz: number, c: V3, R: number, r: number): number {
  const dx = px - c[0];
  const dz = pz - c[2];
  const qx = Math.sqrt(dx * dx + dz * dz) - R;
  const qy = py - c[1];
  return Math.sqrt(qx * qx + qy * qy) - r;
}

// ── Noise for sculpted surface relief ────────────────────────────────────────────────────

// Lattice values from a permutation table: much cheaper than hashing every corner.
const PERM = new Uint8Array(512);
const VALS = new Float32Array(256);
{
  let seed = 1337;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j] as number, p[i] as number];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255] as number;
  for (let i = 0; i < 256; i++) VALS[i] = rnd();
}

const lat = (x: number, y: number, z: number): number => VALS[PERM[(PERM[(PERM[x & 255] as number) + (y & 255)] as number) + (z & 255)] as number] as number;

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c000 = lat(xi, yi, zi);
  const c100 = lat(xi + 1, yi, zi);
  const c010 = lat(xi, yi + 1, zi);
  const c110 = lat(xi + 1, yi + 1, zi);
  const c001 = lat(xi, yi, zi + 1);
  const c101 = lat(xi + 1, yi, zi + 1);
  const c011 = lat(xi, yi + 1, zi + 1);
  const c111 = lat(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * noise3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
