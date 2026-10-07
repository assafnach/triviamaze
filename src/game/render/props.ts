import * as THREE from 'three';
import { GAME_CONFIG, type QualityProfile } from '@/config/gameConfig';
import type { Rng } from '@/utils/rng';
import type { FlameSpec } from '../effects/Flames';
import type { ThemeDef } from '../environments/themes';
import { cellXY, isOpen } from '../maze/grid';
import { DIRS, DX, DY, type Dir, type Maze } from '../maze/types';
import { rockGeometry } from './geometry';
import type { ThemeMaterials } from './materials';
import { runeGlyphTexture, vineTexture } from './textures';

const C = GAME_CONFIG.world.cellSize;
const T = GAME_CONFIG.world.wallThickness;

export interface PropSet {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

interface Placement {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

/** Spot along the base of a wall, facing into the cell. */
interface WallSpot {
  cell: number;
  dir: Dir;
  /** Point on the wall face at floor level. */
  base: THREE.Vector3;
  /** Points from the wall into the cell. */
  inward: THREE.Vector3;
  tangent: THREE.Vector3;
  yaw: number;
}

function bannerTexture(color: number, emblem: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 320;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const col = new THREE.Color(color);
  ctx.fillStyle = `#${col.getHexString()}`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(128, 0);
  ctx.lineTo(128, 290);
  ctx.lineTo(64, 250);
  ctx.lineTo(0, 290);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 128; i += 8) ctx.fillRect(i, 0, 3, 290);
  const em = new THREE.Color(emblem);
  ctx.strokeStyle = `#${em.getHexString()}`;
  ctx.fillStyle = `#${em.getHexString()}`;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 108, 240);
  ctx.beginPath();
  ctx.arc(64, 110, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(64, 70);
  ctx.lineTo(74, 110);
  ctx.lineTo(64, 150);
  ctx.lineTo(54, 110);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crackTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.shadowBlur = 10;
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    if (depth <= 0 || len < 6) return;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const nx = x + Math.cos(a) * len;
    const ny = y + Math.sin(a) * len;
    ctx.lineTo(nx, ny);
    ctx.stroke();
    branch(nx, ny, a + (Math.random() - 0.5) * 1.2, len * 0.75, w * 0.7, depth - 1);
    if (Math.random() < 0.6) branch(nx, ny, a + (Math.random() - 0.5) * 2.2, len * 0.5, w * 0.6, depth - 1);
  };
  branch(10, 128, 0, 60, 6, 6);
  branch(128, 10, Math.PI / 2, 50, 5, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function scatterProps(
  maze: Maze,
  theme: ThemeDef,
  mats: ThemeMaterials,
  quality: QualityProfile,
  rng: Rng,
  flameSpecs: FlameSpec[],
  isReserved: (cell: number) => boolean,
): PropSet {
  const group = new THREE.Group();
  group.name = 'props';
  const disposables: { dispose(): void }[] = [];
  const animated: ((t: number) => void)[] = [];
  const density = quality.propDensity;
  const n = maze.width * maze.height;

  const wallSpots: WallSpot[] = [];
  for (let c = 0; c < n; c++) {
    const { x, y } = cellXY(maze, c);
    for (const d of DIRS) {
      if (isOpen(maze, c, d)) continue;
      if ((c === maze.start && d === maze.startDir) || (c === maze.exit && d === maze.exitDir)) continue;
      const toWall = new THREE.Vector3(DX[d], 0, DY[d]);
      const base = new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2).addScaledVector(toWall, C / 2 - T / 2 - 0.02);
      wallSpots.push({
        cell: c,
        dir: d,
        base,
        inward: toWall.clone().negate(),
        tangent: new THREE.Vector3(-toWall.z, 0, toWall.x),
        yaw: Math.atan2(-toWall.x, -toWall.z),
      });
    }
  }
  const spots = rng.shuffle(wallSpots).filter((s) => !isReserved(s.cell));
  const take = (fraction: number): WallSpot[] => spots.filter(() => rng.chance(fraction * density));

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, placements: Placement[], castShadow = false): void => {
    if (placements.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
    placements.forEach((p, i) => {
      mesh.setMatrixAt(i, p.matrix);
      if (p.color) mesh.setColorAt(i, p.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geo);
  };
  const mtx = (pos: THREE.Vector3, rot: THREE.Euler | THREE.Quaternion, scale: THREE.Vector3 | number): THREE.Matrix4 =>
    new THREE.Matrix4().compose(
      pos,
      rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(rot),
      typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
    );
  const along = (s: WallSpot, t: number, out: number, h = 0): THREE.Vector3 =>
    s.base.clone().addScaledVector(s.tangent, t).addScaledVector(s.inward, out).setY(h);

  const props = new Set(theme.props);

  // Rubble along wall bases (every theme gets a little).
  {
    const placements: Placement[] = [];
    for (const s of take(0.32)) {
      const k = rng.int(1, 3);
      for (let i = 0; i < k; i++) {
        const sc = rng.range(0.12, 0.34);
        placements.push({
          matrix: mtx(along(s, rng.range(-1.4, 1.4), rng.range(0.05, 0.35), sc * 0.3), new THREE.Euler(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3)), sc),
        });
      }
    }
    instanced(rockGeometry(3, 1), mats.stone, placements, true);
  }

  if (props.has('vines')) {
    const mat = new THREE.MeshStandardMaterial({ map: vineTexture(0x3f7a2e), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    disposables.push(mat);
    const placements: Placement[] = [];
    for (const s of take(0.22)) {
      const len = rng.range(1.2, theme.wallHeight * 0.75);
      placements.push({
        matrix: mtx(
          along(s, rng.range(-1.2, 1.2), 0.03, theme.wallHeight - len / 2),
          new THREE.Euler(0, s.yaw, 0),
          new THREE.Vector3(rng.range(0.7, 1.1), len, 1),
        ),
      });
    }
    instanced(new THREE.PlaneGeometry(1, 1), mat, placements);
  }

  if (props.has('mushrooms')) {
    const glowCaps = theme.id === 'mystic' || theme.id === 'crystal';
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      emissive: glowCaps ? new THREE.Color(theme.runeColor) : new THREE.Color(0x000000),
      emissiveIntensity: glowCaps ? 0.9 : 0,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
    disposables.push(capMat, stemMat);
    const caps: Placement[] = [];
    const stems: Placement[] = [];
    const palette = glowCaps ? [0x8a6aff, 0x5ab8ff, 0xd07aff] : [0xc0392b, 0xd4a35a, 0x9a5b3c, 0xe8d2a8];
    for (const s of take(0.26)) {
      const k = rng.int(2, 5);
      for (let i = 0; i < k; i++) {
        const h = rng.range(0.12, 0.4);
        const r = h * rng.range(0.6, 0.9);
        const p = along(s, rng.range(-1.3, 1.3), rng.range(0.08, 0.4), 0);
        stems.push({ matrix: mtx(p.clone().setY(h / 2), new THREE.Euler(), new THREE.Vector3(r * 0.25, h, r * 0.25)) });
        caps.push({ matrix: mtx(p.clone().setY(h), new THREE.Euler(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)), new THREE.Vector3(r, r * 0.6, r)), color: new THREE.Color(rng.pick(palette)) });
      }
    }
    instanced(new THREE.CylinderGeometry(1, 1, 1, 6), stemMat, stems);
    instanced(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, caps);
  }

  if (props.has('crystals')) {
    const placements: Placement[] = [];
    for (const s of take(0.2)) {
      const k = rng.int(2, 4);
      const t0 = rng.range(-1.2, 1.2);
      for (let i = 0; i < k; i++) {
        const h = rng.range(0.25, 0.9);
        placements.push({
          matrix: mtx(
            along(s, t0 + rng.range(-0.3, 0.3), rng.range(0.1, 0.35), h * 0.45),
            new THREE.Euler(rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.5, 0.5)),
            new THREE.Vector3(h * 0.25, h, h * 0.25),
          ),
        });
      }
    }
    instanced(new THREE.OctahedronGeometry(0.5, 0), mats.crystal, placements);
  }

  if (props.has('flowers')) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, emissive: 0x111111 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3e6a2a, roughness: 0.9 });
    disposables.push(mat, stemMat);
    const blossoms: Placement[] = [];
    const stems: Placement[] = [];
    const palette = [0xf2a7c3, 0xfff2a8, 0xffffff, 0xb79cff, 0xffa36b];
    for (const s of take(0.3)) {
      const k = rng.int(4, 9);
      const t0 = rng.range(-1.2, 1.2);
      const col = new THREE.Color(rng.pick(palette));
      for (let i = 0; i < k; i++) {
        const h = rng.range(0.12, 0.32);
        const p = along(s, t0 + rng.range(-0.45, 0.45), rng.range(0.05, 0.45), 0);
        stems.push({ matrix: mtx(p.clone().setY(h / 2), new THREE.Euler(), new THREE.Vector3(0.012, h, 0.012)) });
        blossoms.push({ matrix: mtx(p.clone().setY(h), new THREE.Euler(), 0.045), color: col });
      }
    }
    instanced(new THREE.CylinderGeometry(1, 1, 1, 4), stemMat, stems);
    instanced(new THREE.IcosahedronGeometry(1, 0), mat, blossoms);
  }

  if (props.has('icicles')) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x16303f });
    disposables.push(mat);
    const placements: Placement[] = [];
    for (const s of take(0.45)) {
      const k = rng.int(3, 7);
      for (let i = 0; i < k; i++) {
        const h = rng.range(0.2, 0.9);
        placements.push({
          matrix: mtx(along(s, rng.range(-1.5, 1.5), 0.05, theme.wallHeight - h / 2), new THREE.Euler(Math.PI, 0, 0), new THREE.Vector3(0.06, h, 0.06)),
        });
      }
    }
    instanced(new THREE.ConeGeometry(1, 1, 5), mat, placements);
  }

  if (props.has('banners')) {
    const colors = theme.id === 'temple' ? [0x7a1f1f, 0x1f3a6a] : [0x2a3f7a, 0x6a1f2a, 0x2a5a3a];
    for (const color of colors) {
      const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(color, theme.trim), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
      disposables.push(mat);
      const placements: Placement[] = [];
      for (const s of take(0.06)) {
        placements.push({ matrix: mtx(along(s, rng.range(-0.8, 0.8), 0.05, theme.wallHeight - 1.5), new THREE.Euler(0, s.yaw, 0), new THREE.Vector3(0.85, 2.1, 1)) });
      }
      instanced(new THREE.PlaneGeometry(1, 1), mat, placements);
    }
  }

  if (props.has('candles')) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.7 });
    disposables.push(mat);
    const placements: Placement[] = [];
    const flameColor = new THREE.Color(0xffb060);
    for (const s of take(0.14)) {
      const k = rng.int(3, 6);
      const t0 = rng.range(-1.2, 1.2);
      for (let i = 0; i < k; i++) {
        const h = rng.range(0.12, 0.38);
        const p = along(s, t0 + rng.range(-0.35, 0.35), rng.range(0.08, 0.3), h / 2);
        placements.push({ matrix: mtx(p, new THREE.Euler(), new THREE.Vector3(0.035, h, 0.035)) });
        flameSpecs.push({ position: p.clone().setY(h + 0.05), size: 0.12, color: flameColor });
      }
    }
    instanced(new THREE.CylinderGeometry(1, 1, 1, 6), mat, placements);
  }

  if (props.has('runes')) {
    const mat = new THREE.MeshBasicMaterial({ map: runeGlyphTexture(), color: theme.runeColor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    disposables.push(mat);
    const placements: Placement[] = [];
    for (const s of take(0.12)) {
      placements.push({ matrix: mtx(along(s, rng.range(-1, 1), 0.06, rng.range(1.4, 2.6)), new THREE.Euler(0, s.yaw, 0), 0.55) });
    }
    instanced(new THREE.PlaneGeometry(1, 1), mat, placements);
    animated.push((t) => {
      mat.opacity = 0.35 + 0.25 * Math.sin(t * 1.2);
    });
  }

  if (props.has('lavacracks')) {
    const mat = new THREE.MeshBasicMaterial({ map: crackTexture(), color: 0xff5a10, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    disposables.push(mat);
    const placements: Placement[] = [];
    for (const s of take(0.3)) {
      placements.push({ matrix: mtx(along(s, rng.range(-1, 1), rng.range(0.4, 1.0), 0.015), new THREE.Euler(-Math.PI / 2, 0, rng.range(0, 6)), rng.range(0.9, 1.6)) });
    }
    instanced(new THREE.PlaneGeometry(1, 1), mat, placements);
    animated.push((t) => {
      mat.opacity = 0.65 + 0.3 * Math.sin(t * 0.9);
    });
  }

  if (props.has('books')) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    disposables.push(mat);
    const placements: Placement[] = [];
    const palette = [0x6a2a2a, 0x2a3a6a, 0x3a5a2a, 0x6a5a2a, 0x4a2a5a];
    for (const s of take(0.12)) {
      const k = rng.int(2, 7);
      const p0 = along(s, rng.range(-1.2, 1.2), rng.range(0.15, 0.35), 0);
      let yy = 0;
      for (let i = 0; i < k; i++) {
        const th = rng.range(0.05, 0.1);
        placements.push({
          matrix: mtx(p0.clone().setY(yy + th / 2), new THREE.Euler(0, s.yaw + rng.range(-0.4, 0.4), 0), new THREE.Vector3(rng.range(0.22, 0.32), th, rng.range(0.3, 0.42))),
          color: new THREE.Color(rng.pick(palette)),
        });
        yy += th;
      }
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), mat, placements);
  }

  return {
    group,
    update(time: number) {
      for (const a of animated) a(time);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
