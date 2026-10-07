import * as THREE from 'three';
import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, arms, beard, biped, face, finish, hood, legs, neck, robe, sleeve, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const ORACLE_ROBE: Surface = { color: 0x2a1a40, rough: 0.85, detail: 'cloth', hard: true };
const ORACLE_TRIM: Surface = { color: 0xc8a050, rough: 0.35, detail: 'metal', hard: true };
const SHADOW: Surface = { color: 0x0a0810, rough: 0.9, detail: 'skin' };
const STAR: Surface = { color: 0xe8d8a0, rough: 0.4, detail: 'metal', emissive: 0xd8b860, glow: 0.8, hard: true };
const PALE: Surface = { color: 0xb8a8c8, rough: 0.5, detail: 'skin' };

/** The Oracle, the eye that sees all: a towering hooded seer whose face is only darkness and two violet lights. */
export async function buildOracle(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 2.05,
    hip: 1.05,
    shoulder: 1.66,
    shoulderW: 0.21,
    hipW: 0.1,
    head: [0, 1.84, 0.05],
    headR: 0.12,
    chestZ: 0.03,
    arm: [0.32, 0.29, 0.18],
    armSpread: 0.55,
  });
  torso(b, { surf: ORACLE_ROBE, chest: [0.21, 0.19, 0.15], belly: [0.2, 0.18, 0.16], pelvis: [0.2, 0.14, 0.15] });
  robe(b, { surf: ORACLE_ROBE, top: 1.6, topR: [0.22, 0.17], hem: 0.02, hemR: [0.4, 0.36], folds: 0.018, trim: ORACLE_TRIM, belt: ORACLE_TRIM });
  // Face in perpetual shadow under a deep hood.
  s.ellipsoid(b.spec.head, [0.1, 0.12, 0.1], { bone: b.head, surf: SHADOW, blend: 0.03 });
  hood(b, { surf: ORACLE_ROBE, peak: 0.7, thick: 0.03 });
  s.paintEllipsoid(v3.add(b.spec.head, [0, -0.02, 0.1]), [0.09, 0.12, 0.08], SHADOW, 0.02);
  // Embroidered stars down the front of the robe.
  for (let i = 0; i < 14; i++) {
    const y = 0.15 + (i / 14) * 1.35;
    const r = 0.4 - (y / 1.6) * 0.2;
    const a = Math.PI / 2 + Math.sin(i * 2.4) * 0.9;
    s.paintSphere([Math.cos(a) * r, y, Math.sin(a) * r], 0.018, STAR, 0.006);
  }
  for (const side of ['L', 'R'] as const) sleeve(b, side, ORACLE_ROBE, 2.0, { amp: 0.006, freq: 11, mode: 'folds' });
  arms(b, { surf: PALE, r: [0.04, 0.032, 0.025], covered: true, hand: { surf: PALE, fingers: 4, fingerR: 0.008, fingerLen: 0.85, curl: 0.15 } });
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(b.spec.head, [x * 0.04, 0.01, 0.1]) as V3, r: 0.012, bone: b.head }));
  const rig = await finish(
    s,
    { ctx, eyes, iris: 0xd08aff, eyeGlow: 3, irisScale: 2.4, material: { sheen: 0.2, sheenColor: 0x8a6ac0 } },
    { height: 2.05, gait: 'biped', pointWith: 'armR', flying: false, hoverHeight: 0, magic: 0xc08aff, radius: 0.5, walkSpeed: 0 },
  );
  // A seeing-orb floating between the hands, ringed by a slow-turning band of light.
  const orbMat = new THREE.MeshPhysicalMaterial({ color: 0xe8d8ff, emissive: 0x9a5aff, emissiveIntensity: 1.2, roughness: 0.05, transmission: 0, clearcoat: 1 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const orb = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), orbMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 8, 64), ringMat);
  orb.add(sphere, ring);
  orb.position.set(0, 1.28, 0.42);
  rig.root.add(orb);
  rig.glowMats.push(orbMat);
  rig.disposables.push(sphere.geometry, ring.geometry, orbMat, ringMat);
  rig.extra = (t) => {
    orb.position.y = 1.28 + Math.sin(t * 1.3) * 0.06;
    ring.rotation.set(t * 0.7, t, 0);
  };
  return rig;
}

const SKIN: Surface = { color: 0xc8946c, rough: 0.55, detail: 'skin' };
const LIPS: Surface = { color: 0x9a5a48, rough: 0.5, detail: 'skin' };
const BEARD: Surface = { color: 0x5a3a24, rough: 0.8, detail: 'fur', hard: true };
const COAT: Surface = { color: 0x6a4a2c, rough: 0.8, detail: 'cloth', hard: true };
const SHIRT: Surface = { color: 0x9a8a6a, rough: 0.85, detail: 'cloth', hard: true };
const TROUSERS: Surface = { color: 0x3a3a44, rough: 0.85, detail: 'cloth', hard: true };
const BOOT: Surface = { color: 0x2c2018, rough: 0.6, detail: 'cloth', hard: true };
const HAT: Surface = { color: 0x3c2c20, rough: 0.8, detail: 'cloth', hard: true };
const PACK: Surface = { color: 0x7a5a36, rough: 0.75, detail: 'cloth', hard: true };
const ROLL: Surface = { color: 0x6a2a24, rough: 0.9, detail: 'fur', hard: true };
const BRASS: Surface = { color: 0xc8a050, rough: 0.3, detail: 'metal', hard: true };
const SAND: Surface = { color: 0xffe0a0, rough: 0.4, detail: 'skin', emissive: 0xffc060, glow: 1.6, hard: true };

/** The Time Merchant: a wandering trader with a sky-high pack, a broad hat and a glowing hourglass at his belt. */
export async function buildMerchant(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.78,
    hip: 0.92,
    shoulder: 1.46,
    shoulderW: 0.2,
    hipW: 0.1,
    head: [0, 1.63, 0.06],
    headR: 0.112,
    chestZ: 0.05,
    arm: [0.29, 0.27, 0.17],
    armSpread: 0.3,
  });
  torso(b, { surf: SHIRT, chest: [0.19, 0.17, 0.14], belly: [0.19, 0.17, 0.17], pelvis: [0.18, 0.13, 0.14] });
  neck(b, SKIN, 0.05);
  const f = face(b, { skin: SKIN, brow: 0.5, browSurf: BEARD, nose: 'broad', noseLen: 0.35, lips: LIPS, ears: 'human', eyeR: 0.0145, lids: 0.35, cheeks: { color: 0xd8907a, rough: 0.5, detail: 'skin' } });
  beard(b, f, { surf: BEARD, length: 0.08, width: 0.09 });
  // Broad-brimmed traveller's hat.
  const R = b.spec.headR;
  s.ellipsoid(v3.add(b.spec.head, [0, R * 0.78, -R * 0.05]), [R * 2.3, 0.018, R * 2.2], { bone: b.head, surf: HAT, blend: 0.01, relief: { amp: 0.004, freq: 10, mode: 'lumps' } });
  s.ellipsoid(v3.add(b.spec.head, [0, R * 1.0, -R * 0.08]), [R * 0.98, R * 0.55, R * 0.98], { bone: b.head, surf: HAT, blend: 0.02 });
  s.torus(v3.add(b.spec.head, [0, R * 0.86, -R * 0.08]), R * 0.95, 0.012, { bone: b.head, surf: BRASS, blend: 0.004 });
  // Long open coat over shirt and trousers.
  robe(b, { surf: COAT, top: 1.38, topR: [0.21, 0.17], hem: 0.5, hemR: [0.3, 0.26], folds: 0.012 });
  s.carveEllipsoid([0, 0.75, 0.3], [0.09, 0.3, 0.1], 0.02);
  for (const side of ['L', 'R'] as const) sleeve(b, side, COAT, 1.25, { amp: 0.005, freq: 12, mode: 'folds' });
  arms(b, { surf: SKIN, r: [0.05, 0.04, 0.03], covered: true, hand: { surf: SKIN, fingers: 4, fingerR: 0.0095, fingerLen: 0.65, curl: 0.45 } });
  legs(b, { surf: TROUSERS, r: [0.075, 0.058, 0.045], foot: 'boot', footSurf: BOOT });
  s.torus([0, 0.98, 0.04], 0.19, 0.022, { bone: b.hips, surf: BOOT, blend: 0.008 });
  // The hourglass hangs at his hip, its sand glowing.
  const hg: V3 = [0.2, 0.86, 0.12];
  s.box(v3.add(hg, [0, 0.07, 0]), [0.04, 0.008, 0.04], 0.004, { bone: b.hips, surf: BRASS, blend: 0.003 });
  s.box(v3.add(hg, [0, -0.07, 0]), [0.04, 0.008, 0.04], 0.004, { bone: b.hips, surf: BRASS, blend: 0.003 });
  s.ellipsoid(v3.add(hg, [0, 0.033, 0]), [0.028, 0.032, 0.028], { bone: b.hips, surf: SAND, blend: 0.008 });
  s.ellipsoid(v3.add(hg, [0, -0.033, 0]), [0.028, 0.032, 0.028], { bone: b.hips, surf: SAND, blend: 0.008 });
  // A towering pack: frame, sacks, bedroll, pots and a dangling lantern.
  const back: V3 = [0, 1.25, -0.28];
  s.box(back, [0.2, 0.3, 0.1], 0.04, { bone: b.chest, surf: PACK, blend: 0.02, relief: { amp: 0.006, freq: 14, mode: 'folds' } });
  s.limb(v3.add(back, [-0.24, 0.34, 0]), v3.add(back, [0.24, 0.34, 0]), 0.075, 0.075, { bone: b.chest, surf: ROLL, blend: 0.01, relief: { amp: 0.005, freq: 20, mode: 'lumps' } });
  s.ellipsoid(v3.add(back, [0.14, -0.28, -0.04]), [0.1, 0.12, 0.09], { bone: b.chest, surf: PACK, blend: 0.015, relief: { amp: 0.006, freq: 14, mode: 'folds' } });
  s.sphere(v3.add(back, [-0.16, -0.18, -0.08]), 0.07, { bone: b.chest, surf: BRASS, blend: 0.01 });
  for (const [, x] of SIDES) s.limb(v3.add(back, [x * 0.12, 0.25, 0.08]), [x * 0.13, 1.36, 0.1], 0.016, 0.014, { bone: b.chest, surf: BOOT, blend: 0.01 });
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x6a4a2a,
      irisScale: 1.3,
      material: { sheen: 0.25, sheenColor: 0xd8c0a0 },
      headDetail: { center: [0, 1.61, 0.1], half: [0.15, 0.15, 0.17] },
    },
    { height: 1.78, gait: 'biped', pointWith: 'armR', posture: { spine: [0.06, 0, 0], chest: [0.06, 0, 0] }, flying: false, hoverHeight: 0, magic: 0xffd27a, radius: 0.55, walkSpeed: 0 },
  );
}
