import * as THREE from 'three';

/**
 * Precomputed, tileable noise. Shaders sample these instead of evaluating hash noise, fBm and
 * Voronoi loops per pixel: just as rich, far cheaper to run, and quick to compile (Direct3D
 * shader compilers unroll procedural noise loops into enormous programs).
 */

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Periodic value noise: `p` in [0, 1), `L` lattice cells per period. */
function value3(px: number, py: number, pz: number, L: number, seed: number): number {
  const x = px * L;
  const y = py * L;
  const z = pz * L;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const h = (a: number, b: number, c: number): number => hash3(mod(ix + a, L), mod(iy + b, L), mod(iz + c, L), seed);
  const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * fx;
  const x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * fx;
  const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * fx;
  const x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

let tex3: THREE.Data3DTexture | null = null;
let tex2: THREE.DataTexture | null = null;

/**
 * 64³ RGBA: R = fBm (4 octaves, base 4 cycles), G = Voronoi F1, B = Voronoi F2 − F1 (cell
 * borders), A = cell id. Voronoi has 8 cells per period.
 */
export function noise3D(): THREE.Data3DTexture {
  if (tex3) return tex3;
  const N = 64;
  const V = 8;
  const data = new Uint8Array(N * N * N * 4);
  // Feature points per Voronoi cell.
  const fp = new Float32Array(V * V * V * 3);
  for (let k = 0; k < V; k++)
    for (let j = 0; j < V; j++)
      for (let i = 0; i < V; i++) {
        const o = (i + V * (j + V * k)) * 3;
        fp[o] = hash3(i, j, k, 11);
        fp[o + 1] = hash3(i, j, k, 23);
        fp[o + 2] = hash3(i, j, k, 37);
      }
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = x / N;
        const py = y / N;
        const pz = z / N;
        let f = 0;
        let a = 0.5;
        let L = 4;
        for (let o = 0; o < 4; o++) {
          f += a * value3(px, py, pz, L, 3 + o);
          a *= 0.5;
          L *= 2;
        }
        f /= 0.9375;
        const vx = px * V;
        const vy = py * V;
        const vz = pz * V;
        const cx = Math.floor(vx);
        const cy = Math.floor(vy);
        const cz = Math.floor(vz);
        let f1 = 9;
        let f2 = 9;
        let id = 0;
        for (let dk = -1; dk <= 1; dk++)
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const gi = cx + di;
              const gj = cy + dj;
              const gk = cz + dk;
              const o = (mod(gi, V) + V * (mod(gj, V) + V * mod(gk, V))) * 3;
              const dx = gi + (fp[o] as number) - vx;
              const dy = gj + (fp[o + 1] as number) - vy;
              const dz = gk + (fp[o + 2] as number) - vz;
              const d = dx * dx + dy * dy + dz * dz;
              if (d < f1) {
                f2 = f1;
                f1 = d;
                id = hash3(mod(gi, V), mod(gj, V), mod(gk, V), 51);
              } else if (d < f2) f2 = d;
            }
        f1 = Math.sqrt(f1);
        f2 = Math.sqrt(f2);
        const i4 = (x + N * (y + N * z)) * 4;
        data[i4] = Math.round(Math.min(1, Math.max(0, f)) * 255);
        data[i4 + 1] = Math.round(Math.min(1, f1 / 1.2) * 255);
        data[i4 + 2] = Math.round(Math.min(1, (f2 - f1) / 0.8) * 255);
        data[i4 + 3] = Math.round(id * 255);
      }
    }
  }
  tex3 = new THREE.Data3DTexture(data, N, N, N);
  tex3.format = THREE.RGBAFormat;
  tex3.wrapS = tex3.wrapT = tex3.wrapR = THREE.RepeatWrapping;
  tex3.magFilter = THREE.LinearFilter;
  tex3.minFilter = THREE.LinearFilter;
  tex3.needsUpdate = true;
  return tex3;
}

/** 256² RGBA tileable: R = fBm (base 8 cycles), G = value noise (32 cycles), B = fBm (base 2), A = white noise. */
export function noise2D(): THREE.DataTexture {
  if (tex2) return tex2;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x / N;
      const py = y / N;
      const fbm = (base: number, seed: number): number => {
        let f = 0;
        let a = 0.5;
        let L = base;
        for (let o = 0; o < 5; o++) {
          f += a * value3(px, py, 0, L, seed + o);
          a *= 0.5;
          L *= 2;
        }
        return f / 0.96875;
      };
      const i4 = (x + N * y) * 4;
      data[i4] = Math.round(fbm(8, 100) * 255);
      data[i4 + 1] = Math.round(value3(px, py, 0, 32, 200) * 255);
      data[i4 + 2] = Math.round(fbm(2, 300) * 255);
      data[i4 + 3] = Math.round(hash3(x, y, 0, 400) * 255);
    }
  }
  tex2 = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping;
  tex2.magFilter = THREE.LinearFilter;
  tex2.minFilter = THREE.LinearMipmapLinearFilter;
  tex2.generateMipmaps = true;
  tex2.needsUpdate = true;
  return tex2;
}
