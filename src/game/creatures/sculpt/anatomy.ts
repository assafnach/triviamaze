import * as THREE from 'three';
import { createCreatureMaterial, type CreatureMaterialOptions } from '../../render/detailShader';
import { captureRest, makeEye, voxelFor, type BuildContext, type SkinnedRig } from '../rig';
import { Sculpt, basis, type PrimOptions, type Relief, type Surface } from './Sculpt';
export type { DetailRegion } from './Sculpt';
import type { V3 } from './sdf';

/**
 * Reusable anatomy for sculpted creatures: a biped skeleton with named joints that the animation
 * controller understands, and parametric body parts (torso, limbs, hands, feet, faces with a
 * hinged jaw, garments, hair). Species files compose these and add what makes them unique.
 *
 * Space: the creature faces +Z, +Y is up, its left side is +X ("L").
 */

export type Side = 'L' | 'R';
export const SIDES: [Side, 1 | -1][] = [
  ['L', 1],
  ['R', -1],
];

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const v3mix = mix3;
export const v3 = { add: add3, sub: sub3, mul: mul3, norm: norm3, mix: mix3 };

export interface BipedSpec {
  /** Top of the head (m). */
  height: number;
  /** Hip joint height. */
  hip: number;
  /** Shoulder joint height. */
  shoulder: number;
  shoulderW: number;
  hipW: number;
  /** Head centre and radius. */
  head: V3;
  headR: number;
  /** How far the chest sits forward of the hips (hunch). */
  chestZ?: number;
  /** Upper arm, forearm, hand lengths. */
  arm: [number, number, number];
  /** How far the arms hang away from the body (0 = straight down, 1 = wide). */
  armSpread?: number;
}

export interface ArmJoints {
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  tip: V3;
  up: THREE.Bone;
  fore: THREE.Bone;
  hand: THREE.Bone;
}

export interface LegJoints {
  hip: V3;
  knee: V3;
  ankle: V3;
  toe: V3;
  thigh: THREE.Bone;
  shin: THREE.Bone;
  foot: THREE.Bone;
}

export interface Biped {
  s: Sculpt;
  spec: BipedSpec;
  hips: THREE.Bone;
  spine: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  jaw: THREE.Bone;
  arms: Record<Side, ArmJoints>;
  legs: Record<Side, LegJoints>;
  /** Key points: pelvis, belly, chest centres, neck base. */
  at: { pelvis: V3; belly: V3; chest: V3; neckBase: V3 };
  /** Size relative to a 1.8 m human: blend radii scale with it so small creatures keep their shape. */
  u: number;
}

/** Builds the skeleton and joint positions for a humanoid. */
export function biped(s: Sculpt, spec: BipedSpec): Biped {
  const cz = spec.chestZ ?? 0.02;
  const hipY = spec.hip;
  const shY = spec.shoulder;
  const pelvis: V3 = [0, hipY + 0.02, 0];
  const belly: V3 = [0, hipY + (shY - hipY) * 0.42, cz * 0.5 + 0.01];
  const chestC: V3 = [0, hipY + (shY - hipY) * 0.8, cz];
  const neckBase: V3 = [0, shY + 0.03 * spec.height, cz + spec.headR * 0.1];
  const hips = s.bone('hips', pelvis);
  const spine = s.bone('spine', belly, hips);
  const chest = s.bone('chest', chestC, spine);
  const neck = s.bone('neck', neckBase, chest);
  const headPivot: V3 = [0, spec.head[1] - spec.headR * 0.55, spec.head[2] - spec.headR * 0.15];
  const head = s.bone('head', headPivot, neck);
  const jaw = s.bone('jaw', [0, spec.head[1] - spec.headR * 0.28, spec.head[2] + spec.headR * 0.05], head);
  const spread = spec.armSpread ?? 0.35;
  const arms = {} as Record<Side, ArmJoints>;
  const legs = {} as Record<Side, LegJoints>;
  for (const [side, x] of SIDES) {
    const shoulder: V3 = [x * spec.shoulderW, shY, cz];
    const elbow = add3(shoulder, mul3(norm3([x * spread, -1, 0.1]), spec.arm[0]));
    const wrist = add3(elbow, mul3(norm3([x * spread * 0.45, -1, 0.32]), spec.arm[1]));
    const tip = add3(wrist, mul3(norm3([x * spread * 0.3, -1, 0.28]), spec.arm[2]));
    const up = s.bone(`upperArm${side}`, shoulder, chest);
    const fore = s.bone(`foreArm${side}`, elbow, up);
    const hand = s.bone(`hand${side}`, wrist, fore);
    arms[side] = { shoulder, elbow, wrist, tip, up, fore, hand };
    const hipJ: V3 = [x * spec.hipW, hipY - 0.01, 0];
    const thighLen = hipY * 0.5;
    const knee = add3(hipJ, mul3(norm3([x * 0.05, -1, 0.06]), thighLen));
    const ankle: V3 = [knee[0] + x * 0.005, hipY * 0.08, knee[2] - 0.05 * hipY];
    const toe = add3(ankle, [0, -hipY * 0.05, hipY * 0.28]);
    const thigh = s.bone(`thigh${side}`, hipJ, hips);
    const shin = s.bone(`shin${side}`, knee, thigh);
    const foot = s.bone(`foot${side}`, ankle, shin);
    legs[side] = { hip: hipJ, knee, ankle, toe, thigh, shin, foot };
  }
  return { s, spec, hips, spine, chest, neck, head, jaw, arms, legs, at: { pelvis, belly, chest: chestC, neckBase }, u: spec.height / 1.8 };
}

// ── Body ────────────────────────────────────────────────────────────────────────────────

export interface TorsoOpts {
  surf: Surface;
  /** Half-extents of the rib cage, belly and pelvis. */
  chest: V3;
  belly: V3;
  pelvis: V3;
  /** Belly paint (lighter underside). */
  bellySurf?: Surface;
  relief?: Relief;
  /** Pectoral / bust volumes. */
  bust?: number;
}

export function torso(b: Biped, o: TorsoOpts): void {
  const { s } = b;
  const r = o.relief;
  s.ellipsoid(b.at.pelvis, o.pelvis, { bone: b.hips, surf: o.surf, blend: 0.07 * b.u, relief: r });
  s.ellipsoid(b.at.belly, o.belly, { bone: b.spine, surf: o.surf, blend: 0.08 * b.u, relief: r });
  s.ellipsoid(b.at.chest, o.chest, { bone: b.chest, surf: o.surf, blend: 0.08 * b.u, relief: r });
  // Shoulder girdle and trapezius.
  const sh = b.arms.L.shoulder;
  s.limb([sh[0] * 0.9, sh[1] - 0.01 * b.u, sh[2] - 0.01 * b.u], [-sh[0] * 0.9, sh[1] - 0.01 * b.u, sh[2] - 0.01 * b.u], o.chest[2] * 0.42, o.chest[2] * 0.42, { bone: b.chest, surf: o.surf, blend: 0.06 * b.u });
  s.limb(add3(b.at.neckBase, mul3([0, -0.02, -0.02], b.u)), [sh[0] * 0.75, sh[1] + 0.01 * b.u, sh[2] - 0.02 * b.u], o.chest[2] * 0.3, o.chest[2] * 0.22, { bone: b.chest, surf: o.surf, blend: 0.05 * b.u });
  s.limb(add3(b.at.neckBase, mul3([0, -0.02, -0.02], b.u)), [-sh[0] * 0.75, sh[1] + 0.01 * b.u, sh[2] - 0.02 * b.u], o.chest[2] * 0.3, o.chest[2] * 0.22, { bone: b.chest, surf: o.surf, blend: 0.05 * b.u });
  if (o.bust) {
    for (const [, x] of SIDES) {
      s.ellipsoid([x * o.chest[0] * 0.45, b.at.chest[1] - o.chest[1] * 0.2, b.at.chest[2] + o.chest[2] * 0.72], [o.bust, o.bust * 0.85, o.bust * 0.8], { bone: b.chest, surf: o.surf, blend: 0.05 * b.u });
    }
  }
  if (o.bellySurf) s.paintEllipsoid(add3(b.at.belly, [0, 0, o.belly[2] * 0.7]), [o.belly[0] * 0.75, o.belly[1] * 0.9, o.belly[2] * 0.5], o.bellySurf, 0.05);
}

export function neck(b: Biped, surf: Surface, r: number): void {
  const top: V3 = [0, b.spec.head[1] - b.spec.headR * 0.55, b.spec.head[2] - b.spec.headR * 0.2];
  b.s.limb(add3(b.at.neckBase, mul3([0, -0.04, -0.01], b.u)), top, r, r * 0.88, { bone: b.neck, surf, blend: 0.05 * b.u });
}

export interface HandOpts {
  surf: Surface;
  fingers?: 3 | 4;
  /** Finger thickness. */
  fingerR?: number;
  /** Finger length relative to the hand bone length. */
  fingerLen?: number;
  claw?: Surface;
  /** Curl of the fingers (0 = straight, 1 = fist). */
  curl?: number;
  /** Knuckle tint. */
  knuckle?: Surface;
}

export interface ArmOpts {
  surf: Surface;
  /** Radii at shoulder, elbow and wrist. */
  r: [number, number, number];
  /** Bulge of biceps / forearm muscle. */
  muscle?: number;
  hand: HandOpts;
  relief?: Relief;
  /** Sleeves cover the arm: only sculpt wrists and hands (avoids skin poking through cloth). */
  covered?: boolean;
}

export function arms(b: Biped, o: ArmOpts): void {
  for (const [side] of SIDES) arm(b, side, o);
}

export function arm(b: Biped, side: Side, o: ArmOpts): void {
  const { s } = b;
  const a = b.arms[side];
  const [r0, r1, r2] = o.r;
  const m = o.muscle ?? 1.15;
  if (o.covered) {
    s.limb(v3mix(a.elbow, a.wrist, 0.55), a.wrist, r1 * 0.8, r2, { bone: a.fore, surf: o.surf, blend: 0.02 * b.u });
    hand(b, side, r2, o.hand);
    return;
  }
  s.sphere(a.shoulder, r0 * 1.12, { bone: a.up, surf: o.surf, blend: 0.05 * b.u });
  s.limb(a.shoulder, a.elbow, r0, r1, { bone: a.up, surf: o.surf, blend: 0.035 * b.u, relief: o.relief });
  s.ellipsoid(mix3(a.shoulder, a.elbow, 0.45), [r0 * m * 0.95, r0 * m * 1.25, r0 * m * 0.95], { bone: a.up, surf: o.surf, blend: 0.04 * b.u });
  s.sphere(a.elbow, r1 * 1.02, { bone: a.fore, surf: o.surf, blend: 0.025 * b.u });
  s.limb(a.elbow, a.wrist, r1, r2, { bone: a.fore, surf: o.surf, blend: 0.03 * b.u, relief: o.relief });
  s.ellipsoid(mix3(a.elbow, a.wrist, 0.3), [r1 * m, r1 * m * 1.3, r1 * m], { bone: a.fore, surf: o.surf, blend: 0.04 * b.u });
  hand(b, side, r2, o.hand);
}

export function hand(b: Biped, side: Side, wristR: number, o: HandOpts): void {
  const { s } = b;
  const a = b.arms[side];
  const x = side === 'L' ? 1 : -1;
  const dir = norm3(sub3(a.tip, a.wrist));
  const len = Math.hypot(...sub3(a.tip, a.wrist));
  // Palm: flattened toward the body.
  const [u, , w] = basis(dir, [x, 0, 0]);
  const palmC = add3(a.wrist, mul3(dir, len * 0.32));
  s.blade(palmC, dir, [x, 0, 0], len * 0.36, wristR * 1.25, wristR * 0.62, { bone: a.hand, surf: o.surf, blend: 0.02 * b.u });
  const n = o.fingers ?? 4;
  const fr = o.fingerR ?? wristR * 0.3;
  const fl = (o.fingerLen ?? 0.62) * len;
  const curl = o.curl ?? 0.35;
  const knuckleBase = add3(a.wrist, mul3(dir, len * 0.62));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * 2;
    const across = mul3(w, t * wristR * 0.95 * x);
    const base = add3(knuckleBase, across);
    const lenK = 1 - Math.abs(t) * 0.18;
    // Three phalanges bending toward the palm.
    const inward: V3 = mul3(cross(dir, w), -x);
    const p1 = add3(base, mul3(dir, fl * 0.4 * lenK));
    const d2 = norm3(add3(dir, mul3(inward, curl * 0.7)));
    const p2 = add3(p1, mul3(d2, fl * 0.33 * lenK));
    const d3 = norm3(add3(dir, mul3(inward, curl * 1.4)));
    const p3 = add3(p2, mul3(d3, fl * 0.27 * lenK));
    s.chain([base, p1, p2, p3], [fr, fr * 0.92, fr * 0.82, fr * 0.68], { bone: a.hand, surf: o.surf, blend: 0.006 * b.u });
    if (o.knuckle) s.paintSphere(base, fr * 1.3, o.knuckle, fr);
    if (o.claw) s.limb(p3, add3(p3, mul3(d3, fr * 1.8)), fr * 0.6, fr * 0.12, { bone: a.hand, surf: o.claw, blend: 0.003 * b.u });
  }
  // Thumb from the inner side of the palm.
  const thumbBase = add3(add3(a.wrist, mul3(dir, len * 0.22)), mul3(w, -wristR * 0.85 * x));
  const thumbDir = norm3(add3(dir, add3(mul3(w, -0.55 * x), mul3(u, 0))));
  const t1 = add3(thumbBase, mul3(thumbDir, fl * 0.38));
  const t2 = add3(t1, mul3(norm3(add3(thumbDir, [0, 0, 0.3])), fl * 0.3));
  s.chain([thumbBase, t1, t2], [fr * 1.15, fr, fr * 0.78], { bone: a.hand, surf: o.surf, blend: 0.01 * b.u });
  if (o.claw) s.limb(t2, add3(t2, mul3(thumbDir, fr * 1.6)), fr * 0.55, fr * 0.1, { bone: a.hand, surf: o.claw, blend: 0.003 * b.u });
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface LegOpts {
  surf: Surface;
  /** Radii at hip, knee and ankle. */
  r: [number, number, number];
  foot: 'bare' | 'boot' | 'paw';
  footSurf?: Surface;
  toes?: number;
  claw?: Surface;
  relief?: Relief;
}

export function legs(b: Biped, o: LegOpts): void {
  for (const [side] of SIDES) leg(b, side, o);
}

export function leg(b: Biped, side: Side, o: LegOpts): void {
  const { s } = b;
  const l = b.legs[side];
  const x = side === 'L' ? 1 : -1;
  const [r0, r1, r2] = o.r;
  s.limb(l.hip, l.knee, r0, r1, { bone: l.thigh, surf: o.surf, blend: 0.05 * b.u, relief: o.relief });
  s.ellipsoid(mix3(l.hip, l.knee, 0.35), [r0 * 1.05, r0 * 1.3, r0 * 1.05], { bone: l.thigh, surf: o.surf, blend: 0.05 * b.u });
  s.sphere(add3(l.knee, [0, 0, r1 * 0.25]), r1 * 0.95, { bone: l.shin, surf: o.surf, blend: 0.03 * b.u });
  s.limb(l.knee, l.ankle, r1, r2, { bone: l.shin, surf: o.surf, blend: 0.035 * b.u, relief: o.relief });
  // Calf.
  s.ellipsoid(add3(mix3(l.knee, l.ankle, 0.3), [0, 0, -r1 * 0.35]), [r1 * 1.05, r1 * 1.6, r1 * 1.05], { bone: l.shin, surf: o.surf, blend: 0.04 * b.u });
  const fs = o.footSurf ?? o.surf;
  const footLen = Math.hypot(...sub3(l.toe, l.ankle));
  if (o.foot === 'boot') {
    s.limb(add3(l.ankle, [0, r2 * 1.6, 0]), [l.ankle[0], r2 * 0.6, l.ankle[2]], r2 * 1.25, r2 * 1.3, { bone: l.foot, surf: fs, blend: 0.02 * b.u });
    s.ellipsoid([l.ankle[0], r2 * 0.75, l.ankle[2] + footLen * 0.45], [r2 * 1.15, r2 * 0.8, footLen * 0.62], { bone: l.foot, surf: fs, blend: 0.03 * b.u });
    s.box([l.ankle[0], r2 * 0.12, l.ankle[2] + footLen * 0.42], [r2 * 1.15, r2 * 0.12, footLen * 0.66], 0.01, { bone: l.foot, surf: { ...fs, color: 0x1e1612 }, blend: 0.006 * b.u });
    return;
  }
  // Bare foot / paw: heel, sole and toes.
  s.sphere([l.ankle[0], r2 * 0.95, l.ankle[2] - r2 * 0.25], r2 * 1.05, { bone: l.foot, surf: fs, blend: 0.03 * b.u });
  s.ellipsoid([l.ankle[0] + x * 0.004, r2 * 0.7, l.ankle[2] + footLen * 0.4], [r2 * 1.12, r2 * 0.7, footLen * 0.55], { bone: l.foot, surf: fs, blend: 0.03 * b.u });
  const n = o.toes ?? (o.foot === 'paw' ? 4 : 5);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
    const tx = l.ankle[0] + t * r2 * 0.95 * x;
    const big = o.foot === 'bare' && i === (x > 0 ? 0 : n - 1) ? 1.35 : 1;
    const zr = l.ankle[2] + footLen * (0.86 - Math.abs(t) * 0.1);
    const tr = r2 * (o.foot === 'paw' ? 0.38 : 0.26) * big;
    s.limb([tx, tr * 1.1, zr - tr], [tx + t * 0.004, tr * 0.9, zr + tr * 1.4], tr, tr * 0.85, { bone: l.foot, surf: fs, blend: 0.01 * b.u });
    if (o.claw) s.limb([tx, tr * 0.8, zr + tr * 1.5], [tx, tr * 0.25, zr + tr * 2.6], tr * 0.45, tr * 0.08, { bone: l.foot, surf: o.claw, blend: 0.003 * b.u });
  }
}

// ── Faces ───────────────────────────────────────────────────────────────────────────────

export interface FaceOpts {
  skin: Surface;
  /** Skull half-extents (defaults from headR). */
  skull?: V3;
  /** Brow ridge prominence (0..1). */
  brow?: number;
  browSurf?: Surface;
  nose?: 'human' | 'hooked' | 'button' | 'broad' | 'long' | 'none';
  noseLen?: number;
  noseSurf?: Surface;
  lips?: Surface;
  /** Mouth half-width relative to headR. */
  mouthW?: number;
  ears?: 'human' | 'elf' | 'long' | 'none';
  earSize?: number;
  earInner?: Surface;
  /** Eye spacing and height relative to headR, eye radius in metres. */
  eyeX?: number;
  eyeY?: number;
  eyeR?: number;
  /** Heavy-lidded (0..1). */
  lids?: number;
  cheeks?: Surface;
  chin?: number;
  /** Face wrinkles (age), 0..1. */
  age?: number;
  relief?: Relief;
}

export interface FaceResult {
  eyes: { pos: V3; r: number }[];
  /** Points on the face useful for accessories. */
  noseTip: V3;
  chin: V3;
  mouth: V3;
  brow: V3;
  earTips: V3[];
}

/** A head with skull, cheekbones, brow, nose, lips on a hinged jaw, lidded eye sockets and ears. */
/** Anything with a head and jaw bone: bipeds, quadrupeds with human faces (sphinx), heads on stems. */
export interface HeadRig {
  s: Sculpt;
  head: THREE.Bone;
  jaw: THREE.Bone;
  spec: { head: V3; headR: number };
}

export function face(b: HeadRig, o: FaceOpts): FaceResult {
  const { s, head, jaw } = b;
  const R = b.spec.headR;
  const c = b.spec.head;
  const P = (x: number, y: number, z: number): V3 => [c[0] + x * R, c[1] + y * R, c[2] + z * R];
  const skull = o.skull ?? [R * 0.88, R * 0.95, R * 1.0];
  const hs = o.skin;
  const relief = o.relief ?? { amp: R * 0.008, freq: 3.2 / R, mode: 'lumps' as const };
  const k = (f: number): number => f * R; // blend radii scale with the head

  // Cranium, the flatter plane of the upper face, cheekbones.
  s.ellipsoid(P(0, 0.05, -0.05), skull, { bone: head, surf: hs, blend: k(0.15), relief });
  s.ellipsoid(P(0, -0.05, 0.33), [R * 0.74, R * 0.82, R * 0.62], { bone: head, surf: hs, blend: k(0.14) });
  for (const [, x] of SIDES) s.ellipsoid(P(x * 0.47, -0.2, 0.6), [R * 0.2, R * 0.13, R * 0.18], { bone: head, surf: hs, blend: k(0.1) });
  if (o.cheeks) for (const [, x] of SIDES) s.paintSphere(P(x * 0.48, -0.32, 0.78), R * 0.22, o.cheeks, R * 0.16);

  // Jaw and chin on the jaw bone (opens when speaking).
  const chinK = o.chin ?? 1;
  const chin = P(0, -0.86, 0.6 + 0.05 * chinK);
  for (const [, x] of SIDES) s.limb(P(x * 0.6, -0.42, 0.02), P(x * 0.18, -0.84, 0.56), R * 0.17, R * 0.14, { bone: jaw, surf: hs, blend: k(0.12) });
  s.ellipsoid(chin, [R * 0.2, R * 0.13 * chinK, R * 0.13 * chinK], { bone: jaw, surf: hs, blend: k(0.1) });

  // Muzzle and lips: upper lip on the head, lower lip on the jaw, a dark line where they part.
  const mw = (o.mouthW ?? 0.32) * R;
  const mouth = P(0, -0.585, 0.9);
  const lips = o.lips ?? hs;
  s.ellipsoid(P(0, -0.55, 0.6), [R * 0.4, R * 0.27, R * 0.3], { bone: head, surf: hs, blend: k(0.1) });
  s.ellipsoid(P(0, -0.66, 0.6), [R * 0.36, R * 0.16, R * 0.28], { bone: jaw, surf: hs, blend: k(0.1) });
  s.ellipsoid(P(0, -0.54, 0.83), [mw, R * 0.055, R * 0.07], { bone: head, surf: lips, blend: k(0.05) });
  s.ellipsoid(P(0, -0.64, 0.81), [mw * 0.85, R * 0.06, R * 0.07], { bone: jaw, surf: lips, blend: k(0.05) });
  s.carveEllipsoid(P(0, -0.59, 0.92), [mw * 0.92, R * 0.03, R * 0.1], k(0.02));
  s.paintEllipsoid(P(0, -0.59, 0.88), [mw * 0.88, R * 0.025, R * 0.12], { color: 0x3a1c1a, rough: 0.6, detail: 'skin' }, k(0.025));

  // Brow ridge.
  const bk = o.brow ?? 0.5;
  const browY = 0.22;
  s.chain([P(-0.55, browY - 0.06, 0.74), P(-0.22, browY, 0.88), P(0.22, browY, 0.88), P(0.55, browY - 0.06, 0.74)], [R * 0.06 * (0.6 + bk), R * 0.075 * (0.6 + bk), R * 0.075 * (0.6 + bk), R * 0.06 * (0.6 + bk)], {
    bone: head,
    surf: o.browSurf ?? hs,
    blend: k(0.08),
  });

  // Eyes in carved sockets with upper and lower lids.
  const ex = o.eyeX ?? 0.34;
  const ey = o.eyeY ?? 0.0;
  const er = o.eyeR ?? R * 0.125;
  const lid = o.lids ?? 0.4;
  const eyes: FaceResult['eyes'] = [];
  for (const [, x] of SIDES) {
    const e = P(x * ex, ey, 0.8 - er / R);
    s.carveSphere(P(x * ex, ey, 0.82), er * 1.15, k(0.05));
    // Lids: a skin shell around the eyeball with an almond-shaped opening (narrower with `lids`).
    s.sphere(e, er * 1.1, { bone: head, surf: hs, blend: k(0.03) });
    const open = 0.62 - lid * 0.25;
    s.carveEllipsoid([e[0], e[1] + er * 0.04, e[2] + er * 0.95], [er * 0.98, er * open, er * 0.55], k(0.012));
    // Crease above the upper lid.
    s.carveLimb(P(x * (ex - 0.12), ey + 0.13, 0.83), P(x * (ex + 0.14), ey + 0.11, 0.76), R * 0.012, R * 0.01, k(0.015));
    eyes.push({ pos: e, r: er });
  }

  // Nose.
  const nl = o.noseLen ?? 0.35;
  const ns = o.noseSurf ?? hs;
  const bridge = P(0, 0.06, 0.88);
  let noseTip = P(0, -0.32, 0.98 + nl * 0.5);
  switch (o.nose ?? 'human') {
    case 'hooked':
      noseTip = P(0, -0.38, 0.98 + nl);
      s.chain([bridge, P(0, -0.08, 0.98 + nl * 0.75), noseTip], [R * 0.07, R * 0.1, R * 0.08], { bone: head, surf: ns, blend: k(0.05) });
      s.sphere(P(0, -0.42, 0.94 + nl * 0.9), R * 0.08, { bone: head, surf: ns, blend: k(0.04) });
      break;
    case 'long':
      noseTip = P(0, -0.36, 0.98 + nl);
      s.chain([bridge, P(0, -0.12, 0.96 + nl * 0.5), noseTip], [R * 0.065, R * 0.08, R * 0.1], { bone: head, surf: ns, blend: k(0.05) });
      break;
    case 'button':
      noseTip = P(0, -0.3, 1.0 + nl * 0.2);
      s.limb(bridge, noseTip, R * 0.05, R * 0.11, { bone: head, surf: ns, blend: k(0.07) });
      break;
    case 'broad':
      noseTip = P(0, -0.33, 1.0 + nl * 0.4);
      s.limb(bridge, noseTip, R * 0.08, R * 0.13, { bone: head, surf: ns, blend: k(0.06) });
      break;
    case 'human':
      s.limb(bridge, noseTip, R * 0.06, R * 0.085, { bone: head, surf: ns, blend: k(0.05) });
      break;
    case 'none':
      break;
  }
  if (o.nose !== 'none') {
    // Nostril wings and openings.
    for (const [, x] of SIDES) {
      s.sphere([noseTip[0] + x * R * 0.085, noseTip[1] - R * 0.04, noseTip[2] - R * 0.08], R * 0.065, { bone: head, surf: ns, blend: k(0.035) });
      s.carveSphere([noseTip[0] + x * R * 0.055, noseTip[1] - R * 0.1, noseTip[2] - R * 0.06], R * 0.035, k(0.02));
    }
  }

  // Wrinkles of age: forehead lines and smile folds as shallow grooves.
  if (o.age) {
    for (let i = 0; i < 3; i++) {
      const y = 0.38 + i * 0.1;
      s.carveLimb(P(-0.38, y, 0.82 - i * 0.04), P(0.38, y, 0.82 - i * 0.04), R * 0.016 * o.age, R * 0.016 * o.age, k(0.02));
    }
    for (const [, x] of SIDES) s.carveLimb(P(x * 0.16, -0.38, 0.93), P(x * 0.36, -0.68, 0.8), R * 0.018 * o.age, R * 0.012 * o.age, k(0.02));
  }

  // Ears.
  const earTips: V3[] = [];
  const es = o.earSize ?? 1;
  if ((o.ears ?? 'human') !== 'none') {
    for (const [side, x] of SIDES) {
      const earBone = b.s.bones.get(`ear${side}`) ?? head;
      const base = P(x * skull[0] / R * 0.95, -0.12, -0.02);
      if (o.ears === 'human') {
        const ctr: V3 = [base[0] + x * R * 0.05, base[1], base[2] - R * 0.04];
        // A shell standing off the side of the head (length up, width front-back, thin across).
        s.blade(ctr, [x * 0.12, 1, -0.2], [0, 0, 1], R * 0.3 * es, R * 0.19 * es, R * 0.075, { bone: earBone, surf: hs, blend: k(0.04) });
        s.carveEllipsoid([ctr[0] + x * R * 0.07, ctr[1] - R * 0.02, ctr[2] + R * 0.02], [R * 0.05, R * 0.17 * es, R * 0.1 * es], k(0.02));
        earTips.push([ctr[0], ctr[1] + R * 0.3 * es, ctr[2]]);
      } else {
        const long = o.ears === 'long' ? 1.9 : 1;
        const dir: V3 = norm3([x * 1, 0.55 / long, -0.35]);
        const ctr = add3(base, mul3(dir, R * 0.42 * es * long));
        s.blade(ctr, dir, [0, 1, 0], R * 0.5 * es * long, R * 0.2 * es, R * 0.09, { bone: earBone, surf: hs, blend: k(0.06) });
        const [, , w0] = basis(dir, [0, 1, 0]);
        const w: V3 = w0[2] < 0 ? mul3(w0, -1) : w0;
        s.carveBlade(add3(ctr, mul3(w, R * 0.075)), dir, [0, 1, 0], R * 0.34 * es * long, R * 0.1 * es, R * 0.035, k(0.02));
        if (o.earInner) s.paintSphere(add3(ctr, mul3(w, R * 0.04)), R * 0.25 * es * long, o.earInner, R * 0.1);
        earTips.push(add3(base, mul3(dir, R * 0.9 * es * long)));
      }
    }
  }
  return { eyes, noseTip, chin, mouth, brow: P(0, browY, 0.88), earTips };
}

// ── Garments & hair ─────────────────────────────────────────────────────────────────────

export interface RobeOpts {
  surf: Surface;
  /** Height where the robe starts (usually the chest) and its radii there. */
  top: number;
  topR: [number, number];
  /** Hem height and radii (a robe flares toward the floor). */
  hem: number;
  hemR: [number, number];
  folds?: number;
  /** Belt / sash. */
  belt?: Surface;
  /** Trim along the hem. */
  trim?: Surface;
}

/** A long robe from chest to floor; legs stay inside it. The skirt is one flared cone. */
export function robe(b: Biped, o: RobeOpts): void {
  const { s } = b;
  const folds: Relief = { amp: o.folds ?? 0.012, freq: 9, mode: 'folds' };
  // Bodice over chest and belly.
  s.ellipsoid([0, o.top - 0.06, b.at.chest[2]], [o.topR[0], 0.16, o.topR[1]], { bone: b.chest, surf: o.surf, blend: 0.08 });
  // Skirt: a flared cone from the waist to the hem, flat-bottomed just above the floor.
  const waistY = b.spec.hip + 0.12;
  const waistR = Math.max(o.topR[0], o.topR[1]) * 0.95;
  s.limb([0, waistY, b.at.belly[2] * 0.5], [0, o.hem, -0.01], waistR, Math.max(o.hemR[0], o.hemR[1]), { bone: b.hips, surf: o.surf, blend: 0.1, relief: folds });
  s.carveEllipsoid([0, o.hem - 1.0, 0], [2, 1.0, 2], 0.015);
  if (o.trim) s.paintEllipsoid([0, o.hem + 0.015, 0], [Math.max(...o.hemR) * 1.3, 0.035, Math.max(...o.hemR) * 1.3], o.trim, 0.012);
  if (o.belt) s.torus([0, b.spec.hip + 0.08, b.at.belly[2] * 0.3], waistR * 1.02, 0.018, { bone: b.hips, surf: o.belt, blend: 0.008 });
}

/** A wide sleeve hanging from the upper arm to past the wrist. */
export function sleeve(b: Biped, side: Side, surf: Surface, flare = 1.6, relief?: Relief): void {
  const a = b.arms[side];
  const { s } = b;
  s.limb(a.shoulder, a.elbow, b.spec.headR * 0.42, b.spec.headR * 0.48, { bone: a.up, surf, blend: 0.03, relief });
  s.limb(a.elbow, mix3(a.wrist, a.tip, 0.05), b.spec.headR * 0.48, b.spec.headR * 0.45 * flare, { bone: a.fore, surf, blend: 0.03, relief });
  s.carveSphere(mix3(a.wrist, a.tip, 0.25), b.spec.headR * 0.32 * flare, 0.01);
}

export interface HoodOpts {
  surf: Surface;
  /** Thickness of the cloth shell. */
  thick?: number;
  /** How far the hood peaks behind the head. */
  peak?: number;
}

/** A hood over the head with the face left open; drapes onto the shoulders. */
export function hood(b: Biped, o: HoodOpts): void {
  const { s } = b;
  const R = b.spec.headR;
  const c = b.spec.head;
  const t = o.thick ?? R * 0.18;
  s.ellipsoid(add3(c, [0, R * 0.08, -R * 0.08]), [R * 1.0 + t, R * 1.1 + t, R * 1.08 + t], { bone: b.head, surf: o.surf, blend: 0.04, relief: { amp: 0.006, freq: 12, mode: 'folds' } });
  s.limb(add3(c, [0, R * 0.4, -R * 0.5]), add3(c, [0, R * (0.2 + (o.peak ?? 0.6)), -R * (1.2 + (o.peak ?? 0.6))]), R * 0.55, R * 0.12, { bone: b.head, surf: o.surf, blend: 0.08 });
  // Face opening.
  s.carveEllipsoid(add3(c, [0, -R * 0.15, R * 0.98]), [R * 0.82, R * 1.0, R * 0.62], R * 0.08);
  // Drape on the shoulders.
  s.ellipsoid(add3(b.at.neckBase, [0, -R * 0.15, -R * 0.15]), [b.spec.shoulderW * 1.15, R * 0.55, R * 1.05], { bone: b.chest, surf: o.surf, blend: 0.06, relief: { amp: 0.008, freq: 10, mode: 'folds' } });
}

export interface BeardOpts {
  surf: Surface;
  length: number;
  width: number;
  /** Moustache. */
  moustache?: boolean;
}

/** A full beard hanging from the jaw (sways with the jaw) and an optional moustache. */
export function beard(b: Biped, face: FaceResult, o: BeardOpts): void {
  const { s } = b;
  const R = b.spec.headR;
  const c = b.spec.head;
  const strands: Relief = { amp: R * 0.018, freq: 16, mode: 'folds' };
  s.ellipsoid(add3(face.chin, [0, -R * 0.02, -R * 0.1]), [o.width, R * 0.32, R * 0.3], { bone: b.jaw, surf: o.surf, blend: 0.04, relief: strands });
  // Sideburns along the jaw line, below the cheekbones.
  for (const [, x] of SIDES) s.limb(add3(c, [x * R * 0.78, -R * 0.2, R * 0.1]), add3(c, [x * R * 0.55, -R * 0.78, R * 0.5]), R * 0.15, R * 0.2, { bone: b.jaw, surf: o.surf, blend: 0.04, relief: strands });
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = face.chin[1] - o.length * t;
    s.ellipsoid([0, y + R * 0.1, face.chin[2] - R * 0.12 - t * R * 0.05], [o.width * (1 - t * 0.7), (o.length / steps) * 0.9, R * 0.26 * (1 - t * 0.5)], {
      bone: i < 2 ? b.jaw : b.chest,
      surf: o.surf,
      blend: 0.05,
      relief: strands,
    });
  }
  if (o.moustache !== false) {
    for (const [, x] of SIDES) {
      s.chain([add3(face.mouth, [x * R * 0.05, R * 0.12, R * 0.12]), add3(face.mouth, [x * R * 0.35, R * 0.02, R * 0.08]), add3(face.mouth, [x * R * 0.48, -R * 0.2, R * 0.02])], [R * 0.08, R * 0.07, R * 0.045], {
        bone: b.head,
        surf: o.surf,
        blend: R * 0.04,
        relief: strands,
      });
    }
  }
}

export interface HatOpts {
  surf: Surface;
  brim: number;
  height: number;
  /** Tip droops back and to the side. */
  droop?: number;
  band?: Surface;
}

/** A pointed wizard/witch hat with a wide brim and a crumpled, drooping tip. */
export function pointedHat(b: Biped, o: HatOpts): void {
  const { s } = b;
  const R = b.spec.headR;
  const c = b.spec.head;
  const base: V3 = add3(c, [0, R * 0.8, -R * 0.06]);
  s.ellipsoid(base, [o.brim, Math.max(R * 0.05, 0.016), o.brim * 0.96], { bone: b.head, surf: o.surf, blend: 0.02, relief: { amp: 0.004, freq: 10, mode: 'lumps' } });
  const d = o.droop ?? 0.4;
  const pts: V3[] = [];
  const radii: number[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = d * t * t;
    pts.push(add3(base, [bend * R * 0.6, o.height * t * (1 - bend * 0.2), -bend * R * 1.3]));
    radii.push(R * 0.95 * (1 - t) ** 1.1 + R * 0.025);
  }
  s.chain(pts, radii, { bone: b.head, surf: o.surf, blend: 0.03, relief: { amp: 0.006, freq: 8, mode: 'folds' } });
  if (o.band) s.torus(add3(base, [0, R * 0.12, 0]), R * 0.88, R * 0.07, { bone: b.head, surf: o.band, blend: 0.01 });
}

export interface HairOpts {
  surf: Surface;
  /** Length of hair falling down the back. */
  length: number;
  volume?: number;
  /** Cover the crown too (off under hats and hoods). */
  crown?: boolean;
}

/** Hair: a shell over the crown and locks falling behind the shoulders. */
export function hair(b: Biped, o: HairOpts): void {
  const { s } = b;
  const R = b.spec.headR;
  const c = b.spec.head;
  const v = o.volume ?? 1;
  const strands: Relief = { amp: R * 0.03, freq: 26, mode: 'grooves' };
  if (o.crown !== false) {
    // A cap set back on the skull so it frames the face with a hairline (no carving: that would cut the face).
    s.ellipsoid(add3(c, [0, R * 0.2, -R * 0.2]), [R * 0.97 * v, R * 0.9 * v, R * 0.92 * v], { bone: b.head, surf: o.surf, blend: R * 0.08, relief: strands });
    s.ellipsoid(add3(c, [0, R * 0.62, R * 0.25]), [R * 0.72 * v, R * 0.3 * v, R * 0.5 * v], { bone: b.head, surf: o.surf, blend: R * 0.1, relief: strands });
  }
  for (const [, x] of SIDES) {
    s.chain([add3(c, [x * R * 0.78, -R * 0.05, -R * 0.35]), add3(c, [x * R * 0.85, -R * 0.75, -R * 0.45]), add3(c, [x * R * 0.65, -R * 0.8 - o.length * 0.6, -R * 0.65])], [R * 0.26 * v, R * 0.26 * v, R * 0.18 * v], {
      bone: b.head,
      surf: o.surf,
      blend: 0.04,
      relief: strands,
    });
  }
  s.chain([add3(c, [0, 0, -R * 0.8]), add3(c, [0, -R * 0.9, -R * 0.95]), add3(c, [0, -R * 0.9 - o.length, -R * 0.9])], [R * 0.55 * v, R * 0.5 * v, R * 0.3 * v], {
    bone: b.neck,
    surf: o.surf,
    blend: 0.05,
    relief: strands,
  });
}


// ── Quadrupeds ──────────────────────────────────────────────────────────────────────────

export interface QuadSpec {
  /** Shoulder and hip joint heights. */
  shoulder: number;
  hip: number;
  /** Z of the shoulders (front) and hips (back); the body runs along Z. */
  frontZ: number;
  backZ: number;
  /** Half-width between left and right legs. */
  legW: number;
  head: V3;
  headR: number;
  neckBase: V3;
  /** Tail points from the rump outward. */
  tail: V3[];
}

export interface Quad {
  s: Sculpt;
  spec: QuadSpec & { headR: number };
  hips: THREE.Bone;
  spine: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  jaw: THREE.Bone;
  tail: THREE.Bone[];
  /** Front legs use the arm bone names (the controller's quadruped gait drives them). */
  front: Record<Side, { shoulder: V3; elbow: V3; wrist: V3; paw: V3; up: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone }>;
  back: Record<Side, { hip: V3; knee: V3; hock: V3; paw: V3; thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone }>;
}

export function quadruped(s: Sculpt, spec: QuadSpec): Quad {
  const midZ = (spec.frontZ + spec.backZ) / 2;
  const hips = s.bone('hips', [0, spec.hip, spec.backZ]);
  const spine = s.bone('spine', [0, (spec.hip + spec.shoulder) / 2, midZ], hips);
  const chest = s.bone('chest', [0, spec.shoulder, spec.frontZ], spine);
  const neck = s.bone('neck', spec.neckBase, chest);
  const head = s.bone('head', add3(spec.head, [0, -spec.headR * 0.3, -spec.headR * 0.5]), neck);
  const jaw = s.bone('jaw', add3(spec.head, [0, -spec.headR * 0.35, spec.headR * 0.1]), head);
  const tail: THREE.Bone[] = [];
  let parent = hips;
  spec.tail.forEach((p, i) => {
    parent = s.bone(`tail${i}`, p, parent);
    tail.push(parent);
  });
  const front = {} as Quad['front'];
  const back = {} as Quad['back'];
  for (const [side, x] of SIDES) {
    const shoulder: V3 = [x * spec.legW, spec.shoulder - 0.02, spec.frontZ];
    const elbow: V3 = [x * spec.legW * 1.05, spec.shoulder * 0.55, spec.frontZ - spec.shoulder * 0.06];
    const wrist: V3 = [x * spec.legW * 1.02, spec.shoulder * 0.12, spec.frontZ + spec.shoulder * 0.02];
    const paw: V3 = [x * spec.legW * 1.02, 0.02, spec.frontZ + spec.shoulder * 0.12];
    const up = s.bone(`upperArm${side}`, shoulder, chest);
    const fore = s.bone(`foreArm${side}`, elbow, up);
    const hand = s.bone(`hand${side}`, wrist, fore);
    front[side] = { shoulder, elbow, wrist, paw, up, fore, hand };
    const hipJ: V3 = [x * spec.legW, spec.hip - 0.02, spec.backZ];
    const knee: V3 = [x * spec.legW * 1.05, spec.hip * 0.6, spec.backZ + spec.hip * 0.18];
    const hock: V3 = [x * spec.legW * 1.0, spec.hip * 0.22, spec.backZ - spec.hip * 0.12];
    const pawB: V3 = [x * spec.legW, 0.02, spec.backZ - spec.hip * 0.02];
    const thigh = s.bone(`thigh${side}`, hipJ, hips);
    const shin = s.bone(`shin${side}`, knee, thigh);
    const foot = s.bone(`foot${side}`, hock, shin);
    back[side] = { hip: hipJ, knee, hock, paw: pawB, thigh, shin, foot };
  }
  return { s, spec: { ...spec }, hips, spine, chest, neck, head, jaw, tail, front, back };
}

export interface QuadLegOpts {
  surf: Surface;
  paw?: Surface;
  claw?: Surface;
  /** Leg radii: upper, lower, paw. */
  r: [number, number, number];
  toes?: number;
  relief?: Relief;
}

/** Four legs with padded paws (cats, dogs, dragons). */
export function quadLegs(q: Quad, o: QuadLegOpts): void {
  const { s } = q;
  const [r0, r1, r2] = o.r;
  const paw = (at: V3, dir: V3, bone: THREE.Bone, x: number): void => {
    s.ellipsoid(add3(at, [0, r2 * 0.6, dir[2] * r2 * 0.5]), [r2 * 1.1, r2 * 0.65, r2 * 1.35], { bone, surf: o.paw ?? o.surf, blend: r2 * 0.6 });
    const n = o.toes ?? 4;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * 2;
      const tp: V3 = add3(at, [t * r2 * 0.75 * x, r2 * 0.35, r2 * 1.35]);
      s.sphere(tp, r2 * 0.36, { bone, surf: o.paw ?? o.surf, blend: r2 * 0.3 });
      if (o.claw) s.limb(add3(tp, [0, 0, r2 * 0.25]), add3(tp, [0, -r2 * 0.28, r2 * 0.7]), r2 * 0.14, r2 * 0.03, { bone, surf: o.claw, blend: 0.003 });
    }
  };
  for (const [side, x] of SIDES) {
    const f = q.front[side];
    s.ellipsoid(mix3(f.shoulder, f.elbow, 0.35), [r0 * 1.1, r0 * 1.5, r0 * 1.2], { bone: f.up, surf: o.surf, blend: r0 * 0.8, relief: o.relief });
    s.limb(f.shoulder, f.elbow, r0, r1 * 1.1, { bone: f.up, surf: o.surf, blend: r1, relief: o.relief });
    s.limb(f.elbow, f.wrist, r1 * 1.1, r1 * 0.8, { bone: f.fore, surf: o.surf, blend: r1 * 0.8, relief: o.relief });
    s.limb(f.wrist, add3(f.paw, [0, r2 * 0.5, 0]), r1 * 0.8, r2 * 0.75, { bone: f.hand, surf: o.surf, blend: r2 * 0.5 });
    paw(f.paw, [0, 0, 1], f.hand, x);
    const b = q.back[side];
    s.ellipsoid(mix3(b.hip, b.knee, 0.4), [r0 * 1.25, r0 * 1.7, r0 * 1.45], { bone: b.thigh, surf: o.surf, blend: r0, relief: o.relief });
    s.limb(b.hip, b.knee, r0 * 1.1, r1, { bone: b.thigh, surf: o.surf, blend: r1, relief: o.relief });
    s.limb(b.knee, b.hock, r1, r1 * 0.7, { bone: b.shin, surf: o.surf, blend: r1 * 0.8, relief: o.relief });
    s.limb(b.hock, add3(b.paw, [0, r2 * 0.5, 0]), r1 * 0.7, r2 * 0.75, { bone: b.foot, surf: o.surf, blend: r2 * 0.5 });
    paw(b.paw, [0, 0, 1], b.foot, x);
  }
}

/** A tapering tail: segment i follows tail bone i (points[0] sits at the first tail bone). */
export function tail(q: { s: Sculpt; tail: THREE.Bone[] }, points: V3[], radii: number[], surf: Surface, relief?: Relief): void {
  for (let i = 0; i < points.length - 1; i++) {
    q.s.limb(points[i] as V3, points[i + 1] as V3, radii[i] as number, radii[i + 1] as number, {
      bone: q.tail[Math.min(i, q.tail.length - 1)] as THREE.Bone,
      surf,
      blend: (radii[i] as number) * 0.6,
      relief,
    });
  }
}

// ── Assembly ────────────────────────────────────────────────────────────────────────────

export interface FinishOpts {
  ctx: BuildContext;
  material?: CreatureMaterialOptions;
  /** Voxel scale relative to the creature's height (lower = finer). */
  detail?: number;
  eyes: { pos: V3; r: number; bone: THREE.Bone }[];
  iris: number;
  pupil?: 'round' | 'slit';
  eyeGlow?: number;
  irisScale?: number;
  /**
   * The head (centre, half-extents) is meshed at `headDetail.scale` × the body voxel size, so
   * faces keep crisp features. Omit for creatures without a face worth the cost.
   */
  headDetail?: { center: V3; half: V3; scale?: number };
}

export type RigFields = Omit<SkinnedRig, 'root' | 'mesh' | 'bones' | 'rest' | 'eyes' | 'glowMats' | 'detailMats' | 'disposables'> & {
  glowMats?: THREE.MeshStandardMaterial[];
};

/** Meshes the sculpt, attaches eyes and returns a complete rig. */
export async function finish(s: Sculpt, o: FinishOpts, fields: RigFields): Promise<SkinnedRig> {
  const material = createCreatureMaterial({ physical: true, sheen: 0.3, sheenColor: 0xc8c0a0, ...o.material });
  const voxel = voxelFor(fields.height, o.ctx) * (o.detail ?? 1);
  const hd = o.ctx.faces === false ? undefined : o.headDetail;
  const built = await s.buildAsync(
    material,
    voxel,
    hd ? { min: sub3(hd.center, hd.half), max: add3(hd.center, hd.half), voxel: voxel * (hd.scale ?? 0.42) } : undefined,
    o.ctx.job,
  );
  const disposables: { dispose(): void }[] = [built.mesh.geometry, material];
  const glowMats = fields.glowMats ?? [];
  const eyes: THREE.Object3D[] = [];
  for (const e of o.eyes) {
    const eye = makeEye(e.r, o.iris, { disposables, pupil: o.pupil, glow: o.eyeGlow, irisScale: o.irisScale, glowMats });
    const bw = s.worldOf(e.bone);
    eye.position.set(e.pos[0] - bw[0], e.pos[1] - bw[1], e.pos[2] - bw[2]);
    e.bone.add(eye);
    eyes.push(eye);
  }
  const root = new THREE.Group();
  root.add(built.mesh);
  return {
    ...fields,
    root,
    mesh: built.mesh,
    bones: built.bones,
    rest: captureRest(built.bones),
    eyes,
    glowMats,
    detailMats: [material],
    disposables,
  };
}

export type { PrimOptions, Surface };
