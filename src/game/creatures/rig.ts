import * as THREE from 'three';
import type { QualityLevel } from '@/types';
import type { JobOptions } from './sculpt/pool';

/** How a creature moves; drives the procedural animation set. */
export type Gait = 'biped' | 'quadruped' | 'hover' | 'bird' | 'serpent';

/** A sculpted, skinned creature ready for the animation controller. */
export interface SkinnedRig {
  /** Positioned/rotated in the world by the controller. */
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
  /** Rest-pose local rotations, used as the base every procedural pose is layered on. */
  rest: Map<THREE.Bone, THREE.Quaternion>;
  /** Blinkable eye groups (scaled on Y to blink). */
  eyes: THREE.Object3D[];
  /** Emissive materials that brighten when the creature is pleased. */
  glowMats: THREE.MeshStandardMaterial[];
  /** Animated shader materials (lava, runes) ticked every frame. */
  detailMats: THREE.Material[];
  height: number;
  gait: Gait;
  /** Which limb gestures toward the revealed route. */
  pointWith: 'armR' | 'armL' | 'head' | 'wing' | 'tail';
  /** Characteristic stance layered under every animation (bone → Euler offsets). */
  posture?: Record<string, [number, number, number]>;
  /** How far the hips sink in that stance (metres). */
  postureDrop?: number;
  flying: boolean;
  hoverHeight: number;
  /** Bird perch left behind when it takes off. */
  perch?: THREE.Object3D;
  /** Colour of this creature's magic (route trail). */
  magic: number;
  /** Collision radius. */
  radius: number;
  /** Walk speed in metres per second (0 = does not walk). */
  walkSpeed: number;
  /** Per-frame extras: smoke, embers, floating crystals, cauldron bubbles… */
  extra?: (t: number, dt: number, mood: number) => void;
  disposables: { dispose(): void }[];
}

export interface BuildContext {
  quality: QualityLevel;
  /** Voxel size multiplier (higher = coarser, faster). */
  voxelScale: number;
  /** Sculpt faces at extra resolution (off for distant background casts). */
  faces?: boolean;
  /** Meshing priority and cancellation for this creature's worker jobs. */
  job?: JobOptions;
}

/** An invisible stand-in used while a creature is still being sculpted in the background. */
export function emptyRig(): SkinnedRig {
  return {
    root: new THREE.Group(),
    mesh: new THREE.SkinnedMesh(),
    bones: new Map(),
    rest: new Map(),
    eyes: [],
    glowMats: [],
    detailMats: [],
    height: 1,
    gait: 'biped',
    pointWith: 'head',
    flying: false,
    hoverHeight: 0,
    magic: 0xffffff,
    radius: 0.4,
    walkSpeed: 0,
    disposables: [],
  };
}

export function voxelFor(height: number, ctx: BuildContext): number {
  // About 1/95 of the creature's height on high quality.
  return (height / 95) * ctx.voxelScale;
}

const irisCache = new Map<string, THREE.Texture>();

/** Painted iris texture: radial fibres, limbal ring, pupil, catch-light. */
function irisTexture(iris: number, pupil: 'round' | 'slit', glow: boolean, irisScale: number): THREE.Texture {
  const key = `${iris}-${pupil}-${glow}-${irisScale}`;
  const hit = irisCache.get(key);
  if (hit) return hit;
  // 2:1 so one pixel covers the same angle horizontally and vertically on the sphere.
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const col = new THREE.Color(iris);
  const hex = (cc: THREE.Color): string => `#${cc.getHexString()}`;
  // Sclera.
  ctx.fillStyle = glow ? hex(col.clone().lerp(new THREE.Color(0xffffff), 0.2)) : '#f2ece2';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  // Iris with radial fibres (about 32° angular radius).
  const ir = 46 * irisScale;
  const g = ctx.createRadialGradient(cx, cy, ir * 0.25, cx, cy, ir);
  g.addColorStop(0, hex(col.clone().lerp(new THREE.Color(0xffffff), 0.45)));
  g.addColorStop(0.6, hex(col));
  g.addColorStop(1, hex(col.clone().multiplyScalar(0.45)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * ir * 0.35, cy + Math.sin(a) * ir * 0.35);
    ctx.lineTo(cx + Math.cos(a + 0.05) * ir * 0.95, cy + Math.sin(a + 0.05) * ir * 0.95);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil.
  ctx.fillStyle = '#060506';
  ctx.beginPath();
  if (pupil === 'slit') ctx.ellipse(cx, cy, ir * 0.14, ir * 0.78, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy, ir * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Catch-lights.
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(cx + ir * 0.32, cy - ir * 0.36, ir * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx - ir * 0.3, cy + ir * 0.34, ir * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  irisCache.set(key, t);
  return t;
}

/**
 * A real eyeball: textured sphere (iris faces +Z) under a glossy clear cornea.
 * Returns the group to parent to the head bone; scale.y is animated to blink.
 */
export function makeEye(
  radius: number,
  iris: number,
  opts: { pupil?: 'round' | 'slit'; glow?: number; irisScale?: number; disposables: { dispose(): void }[]; glowMats?: THREE.MeshStandardMaterial[] },
): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 24, 18);
  // Rotate UVs so the texture centre (iris) faces +Z.
  geo.rotateY(-Math.PI / 2);
  const mat = new THREE.MeshPhysicalMaterial({
    map: irisTexture(iris, opts.pupil ?? 'round', !!opts.glow, opts.irisScale ?? 1),
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: opts.glow ? new THREE.Color(iris) : new THREE.Color(0x000000),
    emissiveIntensity: opts.glow ?? 0,
    emissiveMap: opts.glow ? irisTexture(iris, opts.pupil ?? 'round', true, opts.irisScale ?? 1) : null,
  });
  if (opts.glow && opts.glowMats) opts.glowMats.push(mat);
  const eye = new THREE.Mesh(geo, mat);
  g.add(eye);
  opts.disposables.push(geo, mat);
  return g;
}

/** Captures rest rotations for every bone after the skeleton is built. */
export function captureRest(bones: Map<string, THREE.Bone>): Map<THREE.Bone, THREE.Quaternion> {
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of bones.values()) rest.set(b, b.quaternion.clone());
  return rest;
}
