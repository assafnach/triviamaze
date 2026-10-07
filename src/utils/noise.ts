/** Tileable value noise and helpers for procedural textures. */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Periodic value noise in [0, 1]; tiles every `period` units. */
export function tileNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const u = fade(xf);
  const v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal (fBm) tileable noise. u, v in [0, 1). */
export function fbm(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u * freq, v * freq, freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export interface VoronoiResult {
  f1: number;
  f2: number;
  id: number;
  cx: number;
  cy: number;
}

/** Tileable Worley/Voronoi noise over an n×n grid of jittered points, u, v in [0, 1). */
export function voronoi(u: number, v: number, n: number, seed: number, jitter = 0.85): VoronoiResult {
  const x = u * n;
  const y = v * n;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  let cx = 0;
  let cy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = xi + dx;
      const gy = yi + dy;
      const wx = ((gx % n) + n) % n;
      const wy = ((gy % n) + n) % n;
      const px = gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = gy + 0.5 + (hash2(wx, wy, seed + 101) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = wy * n + wx;
        cx = px;
        cy = py;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, id, cx, cy };
}

export function cellRandom(id: number, seed: number): number {
  return hash2(id, id * 7 + 3, seed);
}
