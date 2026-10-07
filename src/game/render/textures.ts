import * as THREE from 'three';
import type { FloorPattern, WallPattern } from '../environments/themes';
import { cellRandom, fbm, voronoi } from '@/utils/noise';

export type SurfacePattern = WallPattern | FloorPattern;

interface Sample {
  /** Height in [0, 1] for normal generation. */
  h: number;
  /** 0 = base colour, 1 = accent colour. */
  mix: number;
  /** 0 = surface, 1 = mortar/crack. */
  mortar: number;
  /** Extra brightness variation around 1. */
  shade: number;
}

type Sampler = (u: number, v: number) => Sample;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function brickSampler(rows: number, cols: number, mortarW: number, seed: number): Sampler {
  return (u, v) => {
    const row = Math.floor(v * rows);
    const offset = row % 2 === 0 ? 0 : 0.5;
    const cu = u * cols + offset;
    const col = Math.floor(cu);
    const lu = cu - col;
    const lv = v * rows - row;
    const id = (row * 97 + (((col % cols) + cols) % cols)) | 0;
    const r = cellRandom(id, seed);
    const edge = Math.min(lu, 1 - lu, (lv * cols) / rows, ((1 - lv) * cols) / rows);
    const wobble = (fbm(u, v, 16, 3, seed + 5) - 0.5) * 0.06;
    const m = 1 - smooth(mortarW * 0.5, mortarW * 1.4, edge + wobble);
    const grain = fbm(u, v, 32, 4, seed + 9);
    // Soft thresholds everywhere: hard steps bake pixel staircases into the normal map.
    const chip = smooth(0.64, 0.72, fbm(u, v, 8, 3, seed + id)) * 0.25;
    return {
      h: (1 - m) * (0.75 + grain * 0.25 - chip) + smooth(0, mortarW * 2, edge) * 0.1,
      mix: Math.min(1, r * 0.9 + (grain - 0.5) * 0.6),
      mortar: m,
      shade: 0.82 + r * 0.3 + (grain - 0.5) * 0.25,
    };
  };
}

function blockSampler(seed: number): Sampler {
  // Large ashlar blocks with an engraved band.
  const base = brickSampler(4, 2, 0.04, seed);
  return (u, v) => {
    const s = base(u, v);
    const band = (1 - smooth(0.008, 0.016, Math.abs(v - 0.5))) * 0.35;
    return { ...s, mortar: Math.max(s.mortar, band * 0.6), h: s.h - band * 0.4 };
  };
}

function rockSampler(seed: number, crackiness: number): Sampler {
  return (u, v) => {
    const n = fbm(u, v, 4, 6, seed);
    const vo = voronoi(u, v, 6, seed + 3, 1);
    const crack = 1 - smooth(0.0, 0.06 * crackiness, vo.f2 - vo.f1);
    const strata = Math.sin((v + n * 0.3) * Math.PI * 10) * 0.5 + 0.5;
    return {
      h: n * 0.8 + strata * 0.15 - crack * 0.4,
      mix: Math.min(1, Math.max(0, fbm(u, v, 3, 3, seed + 11) * 1.6 - 0.4)),
      mortar: crack * 0.8,
      shade: 0.75 + n * 0.5,
    };
  };
}

function basaltSampler(seed: number): Sampler {
  return (u, v) => {
    const vo = voronoi(u, v, 5, seed, 0.6);
    const edge = vo.f2 - vo.f1;
    const m = 1 - smooth(0.02, 0.09, edge);
    const n = fbm(u, v, 12, 4, seed + 2);
    return { h: (1 - m) * (0.7 + n * 0.3), mix: cellRandom(vo.id, seed) * 0.7, mortar: m, shade: 0.8 + n * 0.35 };
  };
}

function hedgeSampler(seed: number): Sampler {
  // Overlapping layers of small, elongated, randomly oriented leaves with dark gaps between them.
  const layers: [number, number][] = [
    [30, 0],
    [19, 1],
    [12, 2],
  ];
  return (u, v) => {
    const big = fbm(u, v, 4, 4, seed);
    let leafH = 0;
    let leafId = 0;
    for (const [n, s] of layers) {
      const vo = voronoi(u, v, n, seed + 7 + s * 13, 1);
      const ang = cellRandom(vo.id, seed + s) * Math.PI;
      const dx = u * n - vo.cx;
      const dy = v * n - vo.cy;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const rx = dx * c + dy * sn;
      const ry = -dx * sn + dy * c;
      const d = Math.hypot(rx / 0.62, ry / 0.3);
      const leaf = Math.max(0, 1 - d) ** 0.55 * (1 - s * 0.12);
      if (leaf > leafH) {
        leafH = leaf;
        leafId = vo.id + s * 1000;
      }
    }
    const holes = smooth(0.58, 0.74, fbm(u, v, 6, 3, seed + 19)) * (1 - leafH);
    return {
      h: leafH * 0.75 + big * 0.25 - holes * 0.4,
      mix: Math.min(1, cellRandom(leafId, seed) * 0.85 + (big - 0.5) * 0.4),
      mortar: Math.min(1, (1 - leafH) * 0.9 + holes * 0.3),
      shade: 0.55 + leafH * 0.6 + (big - 0.5) * 0.35,
    };
  };
}

function iceSampler(seed: number): Sampler {
  return (u, v) => {
    const n = fbm(u, v, 3, 5, seed);
    const vo = voronoi(u, v, 4, seed + 4, 1);
    const crack = 1 - smooth(0, 0.025, vo.f2 - vo.f1);
    return { h: n * 0.6 - crack * 0.2, mix: smooth(0.4, 0.8, n), mortar: crack * 0.5, shade: 0.9 + n * 0.2 };
  };
}

function flagstoneSampler(seed: number, cells: number, mortarW: number): Sampler {
  return (u, v) => {
    const vo = voronoi(u, v, cells, seed, 0.9);
    const edge = vo.f2 - vo.f1;
    const m = 1 - smooth(mortarW * 0.4, mortarW, edge);
    const n = fbm(u, v, 16, 4, seed + 1);
    const r = cellRandom(vo.id, seed);
    const moss = smooth(0.55, 0.7, fbm(u, v, 5, 4, seed + 8)) * 0.8;
    return {
      h: (1 - m) * (0.7 + n * 0.3 + (r - 0.5) * 0.15),
      mix: Math.max(moss, m * 0.6),
      mortar: m * (1 - moss * 0.5),
      shade: 0.78 + r * 0.32 + (n - 0.5) * 0.25,
    };
  };
}

function cobbleSampler(seed: number): Sampler {
  return (u, v) => {
    const vo = voronoi(u, v, 10, seed, 0.75);
    const dome = Math.max(0, 1 - (vo.f1 / 0.55) ** 2);
    const edge = vo.f2 - vo.f1;
    const m = 1 - smooth(0.02, 0.12, edge);
    const n = fbm(u, v, 24, 3, seed + 3);
    return { h: dome * (1 - m * 0.8), mix: cellRandom(vo.id, seed) * 0.8, mortar: m, shade: 0.75 + dome * 0.3 + (n - 0.5) * 0.2 };
  };
}

function mossSampler(seed: number): Sampler {
  return (u, v) => {
    const n = fbm(u, v, 6, 6, seed);
    const tufts = voronoi(u, v, 18, seed + 2, 1);
    const tuft = 1 - smooth(0, 0.45, tufts.f1);
    const dirt = smooth(0.5, 0.65, fbm(u, v, 3, 4, seed + 6));
    return { h: n * 0.5 + tuft * 0.4, mix: dirt, mortar: 0, shade: 0.7 + tuft * 0.35 + (n - 0.5) * 0.3 };
  };
}

function tileSampler(seed: number): Sampler {
  return (u, v) => {
    const t = 4;
    const tu = (u * t) % 1;
    const tv = (v * t) % 1;
    const id = Math.floor(u * t) + Math.floor(v * t) * 31;
    const edge = Math.min(tu, 1 - tu, tv, 1 - tv);
    const m = 1 - smooth(0.015, 0.045, edge);
    const inlay = 1 - smooth(0.012, 0.022, Math.abs(Math.abs(tu - 0.5) + Math.abs(tv - 0.5) - 0.32));
    const n = fbm(u, v, 20, 4, seed);
    const veins = smooth(0.48, 0.5, Math.abs(fbm(u, v, 6, 5, seed + 4) - 0.5) + 0.48);
    return {
      h: (1 - m) * 0.85 - inlay * 0.1,
      mix: Math.max(inlay, veins * 0.3),
      mortar: m,
      shade: 0.85 + cellRandom(id, seed) * 0.2 + (n - 0.5) * 0.15,
    };
  };
}

function samplerFor(pattern: SurfacePattern, seed: number): Sampler {
  switch (pattern) {
    case 'bricks':
      return brickSampler(8, 4, 0.05, seed);
    case 'blocks':
      return blockSampler(seed);
    case 'rock':
      return rockSampler(seed, 1);
    case 'basalt':
      return basaltSampler(seed);
    case 'hedge':
      return hedgeSampler(seed);
    case 'ice':
      return iceSampler(seed);
    case 'flagstone':
      return flagstoneSampler(seed, 5, 0.07);
    case 'cobble':
      return cobbleSampler(seed);
    case 'moss':
      return mossSampler(seed);
    case 'tiles':
      return tileSampler(seed);
  }
}

export interface SurfaceTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

const cache = new Map<string, SurfaceTextures>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Generates a seamless colour + normal map pair for a surface pattern. */
export function surfaceTextures(
  pattern: SurfacePattern,
  colors: { base: number; accent: number; mortar: number },
  size: number,
  normalStrength = 2.4,
  seed = 7,
): SurfaceTextures {
  const key = `${pattern}|${colors.base}|${colors.accent}|${colors.mortar}|${size}|${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const sampler = samplerFor(pattern, seed);
  const height = new Float32Array(size * size);
  const [colorCanvas, cctx] = makeCanvas(size);
  const img = cctx.createImageData(size, size);
  const base = new THREE.Color(colors.base);
  const accent = new THREE.Color(colors.accent);
  const mortar = new THREE.Color(colors.mortar);
  const tmp = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sampler(x / size, y / size);
      const i = y * size + x;
      height[i] = s.h;
      tmp.copy(base).lerp(accent, Math.min(1, Math.max(0, s.mix)));
      tmp.multiplyScalar(s.shade);
      tmp.lerp(mortar, Math.min(1, Math.max(0, s.mortar)));
      img.data[i * 4] = Math.min(255, tmp.r * 255);
      img.data[i * 4 + 1] = Math.min(255, tmp.g * 255);
      img.data[i * 4 + 2] = Math.min(255, tmp.b * 255);
      img.data[i * 4 + 3] = 255;
    }
  }
  cctx.putImageData(img, 0, 0);

  const [normalCanvas, nctx] = makeCanvas(size);
  const nimg = nctx.createImageData(size, size);
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)] as number;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * normalStrength * (size / 256);
      const dy = (at(x, y + 1) - at(x, y - 1)) * normalStrength * (size / 256);
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  for (const t of [map, normalMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    // Keeps floors and walls crisp at grazing angles (clamped to the GPU's maximum).
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const result = { map, normalMap };
  cache.set(key, result);
  return result;
}

// ---- Sprite textures --------------------------------------------------------------------

const spriteCache = new Map<string, THREE.Texture>();

function spriteTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(size);
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, t);
  return t;
}

/** Soft radial glow. */
export const glowTexture = (): THREE.Texture =>
  spriteTexture('glow', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

/** Teardrop flame shape, white-hot core. Tinted by vertex colour. */
export const flameTexture = (): THREE.Texture =>
  spriteTexture('flame', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s * 0.68, s * 0.02, s / 2, s * 0.6, s * 0.45);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.3, 'rgba(255,220,140,0.9)');
    g.addColorStop(0.65, 'rgba(255,120,40,0.35)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.06);
    ctx.bezierCurveTo(s * 0.86, s * 0.5, s * 0.82, s * 0.96, s / 2, s * 0.96);
    ctx.bezierCurveTo(s * 0.18, s * 0.96, s * 0.14, s * 0.5, s / 2, s * 0.06);
    ctx.fill();
  });

/** Four-point star sparkle. */
export const sparkleTexture = (): THREE.Texture =>
  spriteTexture('sparkle', 64, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c, 2);
    ctx.lineTo(c, s - 2);
    ctx.moveTo(2, c);
    ctx.lineTo(s - 2, c);
    ctx.stroke();
  });

/** Circle of glowing runes used on the floor of a revealed route. */
export const runeCircleTexture = (): THREE.Texture =>
  spriteTexture('runes', 512, (ctx, s) => {
    const c = s / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    // Glyphs between the rings.
    const glyphs = 16;
    for (let i = 0; i < glyphs; i++) {
      ctx.save();
      ctx.rotate((i / glyphs) * Math.PI * 2);
      ctx.translate(0, -s * 0.405);
      ctx.lineWidth = 4;
      ctx.beginPath();
      const k = i % 4;
      if (k === 0) {
        ctx.moveTo(-10, 12);
        ctx.lineTo(0, -12);
        ctx.lineTo(10, 12);
      } else if (k === 1) {
        ctx.moveTo(-8, -10);
        ctx.lineTo(8, -10);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 12);
      } else if (k === 2) {
        ctx.arc(0, 0, 9, 0, Math.PI * 1.5);
      } else {
        ctx.moveTo(-9, -9);
        ctx.lineTo(9, 9);
        ctx.moveTo(9, -9);
        ctx.lineTo(-9, 9);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Inner six-pointed star made of two triangles.
    ctx.lineWidth = 3;
    for (const offset of [0, Math.PI / 3]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = offset + (i / 3) * Math.PI * 2;
        const x = Math.sin(a) * s * 0.3;
        const y = -Math.cos(a) * s * 0.3;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  });

/** Single wall rune glyph for decorative panels. */
export const runeGlyphTexture = (): THREE.Texture =>
  spriteTexture('glyph', 128, (ctx, s) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.12);
    ctx.lineTo(s * 0.5, s * 0.88);
    ctx.moveTo(s * 0.5, s * 0.35);
    ctx.lineTo(s * 0.25, s * 0.15);
    ctx.moveTo(s * 0.5, s * 0.35);
    ctx.lineTo(s * 0.75, s * 0.15);
    ctx.moveTo(s * 0.3, s * 0.65);
    ctx.lineTo(s * 0.7, s * 0.65);
    ctx.stroke();
  });

/** Vertical strip of hanging leaves (alpha). */
export const vineTexture = (color: number): THREE.Texture =>
  spriteTexture(`vine-${color}`, 128, (ctx, s) => {
    const col = new THREE.Color(color);
    for (let i = 0; i < 70; i++) {
      const x = s * 0.5 + Math.sin(i * 1.7) * s * 0.28 + Math.sin(i * 0.31) * s * 0.1;
      const y = (i / 70) * s;
      const shade = 0.6 + ((i * 37) % 10) / 22;
      ctx.fillStyle = `rgba(${(col.r * 255 * shade) | 0},${(col.g * 255 * shade) | 0},${(col.b * 255 * shade) | 0},1)`;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.07, s * 0.035, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(40,60,20,1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    for (let y = 0; y < s; y += 8) ctx.lineTo(s * 0.5 + Math.sin(y * 0.05) * s * 0.15, y);
    ctx.stroke();
  });

/** Starfield + gradient sky for open-air themes (equirectangular-ish, used on a sphere). */
export function skyTexture(top: number, bottom: number, stars: boolean, seed = 3): THREE.Texture {
  const key = `sky-${top}-${bottom}-${stars}-${seed}`;
  return spriteTexture(key, 1024, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    const t = new THREE.Color(top);
    const b = new THREE.Color(bottom);
    g.addColorStop(0, `#${t.getHexString()}`);
    g.addColorStop(0.55, `#${t.clone().lerp(b, 0.6).getHexString()}`);
    g.addColorStop(1, `#${b.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    if (!stars) return;
    let r = seed;
    const rand = (): number => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1400; i++) {
      const x = rand() * s;
      const y = rand() * s * 0.62;
      const bright = rand();
      ctx.fillStyle = `rgba(255,255,255,${0.25 + bright * 0.75})`;
      const size = bright > 0.97 ? 1.8 : bright > 0.85 ? 1.1 : 0.6;
      ctx.fillRect(x, y, size, size);
    }
  });
}

export function moonTexture(): THREE.Texture {
  return spriteTexture('moon', 256, (ctx, s) => {
    const c = s / 2;
    const halo = ctx.createRadialGradient(c, c, s * 0.15, c, c, s * 0.5);
    halo.addColorStop(0, 'rgba(230,240,255,0.6)');
    halo.addColorStop(1, 'rgba(230,240,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, s, s);
    const disc = ctx.createRadialGradient(c - 10, c - 10, 4, c, c, s * 0.18);
    disc.addColorStop(0, 'rgba(255,255,250,1)');
    disc.addColorStop(1, 'rgba(210,220,240,1)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,170,190,0.35)';
    for (const [x, y, r] of [
      [-12, -8, 9],
      [14, 10, 7],
      [4, -18, 5],
      [-6, 16, 6],
    ] as const) {
      ctx.beginPath();
      ctx.arc(c + x, c + y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Silhouette of a flying dragon (for rare sky events). */
export function dragonSilhouetteTexture(): THREE.Texture {
  return spriteTexture('dragon-sil', 512, (ctx, s) => {
    ctx.fillStyle = 'rgba(5,6,12,0.95)';
    ctx.translate(s / 2, s / 2);
    ctx.beginPath();
    // body
    ctx.ellipse(0, 0, s * 0.16, s * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    // neck + head
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.01);
    ctx.quadraticCurveTo(s * 0.24, -s * 0.06, s * 0.3, -s * 0.03);
    ctx.lineTo(s * 0.36, -s * 0.02);
    ctx.lineTo(s * 0.3, s * 0.0);
    ctx.quadraticCurveTo(s * 0.22, -s * 0.01, s * 0.12, s * 0.02);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, -s * 0.01);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.0, -s * 0.44, -s * 0.05);
    ctx.lineTo(-s * 0.47, -s * 0.03);
    ctx.lineTo(-s * 0.44, -s * 0.02);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.03, -s * 0.13, s * 0.02);
    ctx.fill();
    // wings
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, 0);
      ctx.lineTo(s * 0.02, dir * s * 0.42);
      ctx.lineTo(-s * 0.05, dir * s * 0.34);
      ctx.lineTo(-s * 0.1, dir * s * 0.38);
      ctx.lineTo(-s * 0.12, dir * s * 0.28);
      ctx.lineTo(-s * 0.18, dir * s * 0.3);
      ctx.lineTo(-s * 0.1, 0);
      ctx.fill();
    }
  });
}

/** Animated-looking magical veil for the exit portal. */
export function portalTexture(): THREE.Texture {
  return spriteTexture('portal', 256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s * 0.55, 0, s / 2, s * 0.55, s * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,240,200,0.85)');
    g.addColorStop(0.7, 'rgba(255,200,120,0.3)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function disposeTextureCaches(): void {
  for (const t of cache.values()) {
    t.map.dispose();
    t.normalMap.dispose();
  }
  cache.clear();
}
