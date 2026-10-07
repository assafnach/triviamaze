import * as THREE from 'three';
import { createCreatureMaterial } from '../../render/detailShader';
import { captureRest, makeEye, voxelFor, type BuildContext, type SkinnedRig } from '../rig';
import { Sculpt, basis, type Surface } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SKIN: Surface = { color: 0x5f6e38, rough: 0.58, detail: 'skin' };
const SKIN_DARK: Surface = { color: 0x4a5629, rough: 0.6, detail: 'skin' };
const BELLY: Surface = { color: 0x7f8250, rough: 0.6, detail: 'skin' };
const FLUSH: Surface = { color: 0x80603a, rough: 0.55, detail: 'skin' };
const EAR_INNER: Surface = { color: 0x9a6650, rough: 0.5, detail: 'skin' };
const LIPS: Surface = { color: 0x463428, rough: 0.6, detail: 'skin' };
const TEETH: Surface = { color: 0xd9cca4, rough: 0.32, detail: 'horn', hard: true };
const CLAW: Surface = { color: 0x2a2018, rough: 0.4, detail: 'horn', hard: true };
const LEATHER: Surface = { color: 0x4f3220, rough: 0.68, detail: 'cloth', hard: true };
const LEATHER_DARK: Surface = { color: 0x33211a, rough: 0.66, detail: 'cloth', hard: true };
const CLOTH: Surface = { color: 0x6a5838, rough: 0.85, detail: 'cloth', hard: true };
const BRASS: Surface = { color: 0xb08a4c, rough: 0.32, detail: 'metal', hard: true };

/** Goblin: wiry, potbellied trickster with oversized ears, hooked nose and a tusky grin. */
export async function buildGoblin(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const hips = s.bone('hips', [0, 0.56, 0]);
  const spine = s.bone('spine', [0, 0.7, 0.01], hips);
  const chest = s.bone('chest', [0, 0.84, 0.04], spine);
  const neck = s.bone('neck', [0, 0.96, 0.09], chest);
  const head = s.bone('head', [0, 1.03, 0.12], neck);
  const ear = { L: s.bone('earL', [0.13, 1.08, 0.1], head), R: s.bone('earR', [-0.13, 1.08, 0.1], head) };
  const arm = (side: 'L' | 'R', x: number): { up: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone } => {
    const up = s.bone(`upperArm${side}`, [x * 0.18, 0.885, 0.04], chest);
    const fore = s.bone(`foreArm${side}`, [x * 0.27, 0.69, 0.07], up);
    const hand = s.bone(`hand${side}`, [x * 0.318, 0.525, 0.128], fore);
    return { up, fore, hand };
  };
  const leg = (side: 'L' | 'R', x: number): { thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone } => {
    const thigh = s.bone(`thigh${side}`, [x * 0.085, 0.54, 0.01], hips);
    const shin = s.bone(`shin${side}`, [x * 0.105, 0.31, 0.08], thigh);
    const foot = s.bone(`foot${side}`, [x * 0.11, 0.08, 0.02], shin);
    return { thigh, shin, foot };
  };
  const arms = { L: arm('L', 1), R: arm('R', -1) };
  const legs = { L: leg('L', 1), R: leg('R', -1) };

  // ── Torso ──
  s.ellipsoid([0, 0.67, 0.085], [0.15, 0.14, 0.13], { bone: spine, surf: SKIN, blend: 0.06 });
  s.ellipsoid([0, 0.82, 0.05], [0.165, 0.15, 0.125], { bone: chest, surf: SKIN, blend: 0.06 });
  s.ellipsoid([0, 0.87, -0.02], [0.13, 0.09, 0.09], { bone: chest, surf: SKIN_DARK, blend: 0.06 });
  s.ellipsoid([0, 0.56, 0.02], [0.14, 0.09, 0.11], { bone: hips, surf: SKIN, blend: 0.06 });
  s.paintEllipsoid([0, 0.66, 0.16], [0.11, 0.12, 0.08], BELLY, 0.05);
  s.both((_x, m) => s.limb(m([0.04, 0.925, 0.12]), m([0.15, 0.905, 0.07]), 0.016, 0.014, { bone: chest, surf: SKIN, blend: 0.03 }));

  // Leather vest: a real garment layer over back and sides (front left open over the belly).
  s.ellipsoid([0, 0.815, 0.02], [0.186, 0.168, 0.14], { bone: chest, surf: LEATHER, blend: 0.004, relief: { amp: 0.002, freq: 40, mode: 'lumps' } });
  s.both((_x, m) => s.limb(m([0.08, 0.918, 0.12]), m([0.105, 0.958, -0.05]), 0.02, 0.02, { bone: chest, surf: LEATHER_DARK, blend: 0.004 }));

  // ── Neck & head ──
  s.limb([0, 0.88, 0.06], [0, 0.995, 0.12], 0.06, 0.05, { bone: neck, surf: SKIN, blend: 0.04 });
  s.ellipsoid([0, 1.07, 0.11], [0.145, 0.125, 0.14], { bone: head, surf: SKIN, blend: 0.05, relief: { amp: 0.003, freq: 28, mode: 'lumps' } });
  s.ellipsoid([0, 1.0, 0.19], [0.115, 0.09, 0.09], { bone: head, surf: SKIN, blend: 0.05 });
  s.ellipsoid([0, 0.935, 0.2], [0.095, 0.045, 0.075], { bone: head, surf: SKIN, blend: 0.035 });
  s.sphere([0, 0.918, 0.25], 0.03, { bone: head, surf: SKIN, blend: 0.03 });
  s.both((_x, m) => s.ellipsoid(m([0.075, 0.99, 0.23]), [0.042, 0.033, 0.035], { bone: head, surf: SKIN, blend: 0.03 }));
  s.both((_x, m) => s.paintSphere(m([0.085, 0.985, 0.25]), 0.035, FLUSH, 0.03));
  // Heavy, knotted brow.
  s.chain(
    [
      [-0.1, 1.068, 0.225],
      [-0.035, 1.082, 0.25],
      [0.035, 1.082, 0.25],
      [0.1, 1.068, 0.225],
    ],
    [0.024, 0.028, 0.028, 0.024],
    { bone: head, surf: SKIN_DARK, blend: 0.03 },
  );
  // Long hooked nose with a warm, bulbous tip.
  s.limb([0, 1.07, 0.255], [0, 1.045, 0.292], 0.024, 0.029, { bone: head, surf: SKIN, blend: 0.02 });
  s.limb([0, 1.045, 0.292], [0, 0.995, 0.366], 0.029, 0.021, { bone: head, surf: SKIN, blend: 0.015 });
  s.sphere([0, 0.99, 0.361], 0.026, { bone: head, surf: FLUSH, blend: 0.015 });
  s.both((_x, m) => s.carveSphere(m([0.014, 0.972, 0.356]), 0.009, 0.004));
  for (const w of [
    [0.022, 1.025, 0.335],
    [-0.062, 0.985, 0.262],
    [0.09, 1.11, 0.17],
    [-0.035, 1.12, 0.2],
  ] as V3[])
    s.sphere(w, 0.007, { bone: head, surf: SKIN_DARK, blend: 0.006 });
  // Mouth: a heavy, protruding lower lip under a wide sly crease, two tusks jutting up (underbite).
  s.ellipsoid([0, 0.93, 0.262], [0.07, 0.022, 0.03], { bone: head, surf: LIPS, blend: 0.02 });
  s.carveLimb([-0.075, 0.958, 0.252], [0, 0.948, 0.292], 0.012, 0.013, 0.008);
  s.carveLimb([0, 0.948, 0.292], [0.075, 0.958, 0.252], 0.013, 0.012, 0.008);
  s.paintEllipsoid([0, 0.95, 0.27], [0.08, 0.02, 0.04], LIPS, 0.015);
  s.both((_x, m) => s.limb(m([0.034, 0.935, 0.282]), m([0.04, 0.985, 0.288]), 0.012, 0.004, { bone: head, surf: TEETH, blend: 0.004 }));
  // Eye sockets with heavy upper lids and a lower lid fold, so the eyes read as alive, not glued on.
  s.both((_x, m) => s.carveSphere(m([0.052, 1.04, 0.248]), 0.028, 0.012));
  s.both((_x, m) => s.limb(m([0.024, 1.06, 0.258]), m([0.08, 1.058, 0.24]), 0.013, 0.012, { bone: head, surf: SKIN_DARK, blend: 0.01 }));
  s.both((_x, m) => s.limb(m([0.028, 1.019, 0.255]), m([0.078, 1.022, 0.24]), 0.009, 0.009, { bone: head, surf: SKIN, blend: 0.01 }));
  // Ears: long, swept back, with an inner bowl and warm rims.
  s.both((x, m) => {
    const b = x === 1 ? ear.L : ear.R;
    const dir: V3 = [x * 1, 0.38, -0.25];
    s.limb(m([0.12, 1.07, 0.1]), m([0.175, 1.09, 0.08]), 0.035, 0.028, { bone: b, surf: SKIN, blend: 0.03 });
    const c = m([0.265, 1.125, 0.055]);
    s.blade(c, dir, [0, 1, 0], 0.165, 0.066, 0.026, { bone: b, surf: SKIN, blend: 0.02, relief: { amp: 0.002, freq: 35, mode: 'lumps' } });
    const [, , w0] = basis(dir, [0, 1, 0]);
    const w: V3 = w0[2] < 0 ? [-w0[0], -w0[1], -w0[2]] : w0;
    s.carveBlade([c[0] + w[0] * 0.016, c[1] + w[1] * 0.016, c[2] + w[2] * 0.016], dir, [0, 1, 0], 0.125, 0.044, 0.016, 0.01);
    s.paintSphere([c[0] + w[0] * 0.012, c[1], c[2] + w[2] * 0.012], 0.065, EAR_INNER, 0.03);
  });

  // ── Arms ──
  s.both((x, m) => {
    const a = x === 1 ? arms.L : arms.R;
    s.sphere(m([0.18, 0.88, 0.04]), 0.055, { bone: a.up, surf: SKIN, blend: 0.045 });
    s.limb(m([0.18, 0.88, 0.04]), m([0.27, 0.69, 0.07]), 0.045, 0.034, { bone: a.up, surf: SKIN, blend: 0.03 });
    s.sphere(m([0.27, 0.69, 0.07]), 0.034, { bone: a.fore, surf: SKIN_DARK, blend: 0.02 });
    s.ellipsoid(m([0.287, 0.635, 0.09]), [0.04, 0.055, 0.04], { bone: a.fore, surf: SKIN, blend: 0.03 });
    s.limb(m([0.27, 0.69, 0.07]), m([0.315, 0.535, 0.125]), 0.034, 0.028, { bone: a.fore, surf: SKIN, blend: 0.025 });
    s.torus(m([0.31, 0.56, 0.118]), 0.032, 0.011, { bone: a.fore, surf: LEATHER, blend: 0.006 });
    s.ellipsoid(m([0.326, 0.49, 0.145]), [0.032, 0.046, 0.024], { bone: a.hand, surf: SKIN_DARK, blend: 0.02 });
    for (const f of [-1, 0, 1]) {
      const fx = 0.326 + f * 0.016;
      const p0 = m([fx, 0.455, 0.152 + Math.abs(f) * -0.004]);
      const p1 = m([fx + f * 0.004, 0.416, 0.172]);
      const p2 = m([fx + f * 0.006, 0.39, 0.18]);
      s.chain([p0, p1, p2], [0.012, 0.0105, 0.008], { bone: a.hand, surf: SKIN_DARK, blend: 0.008 });
      s.sphere(p1, 0.0115, { bone: a.hand, surf: FLUSH, blend: 0.006 });
      s.limb(p2, m([fx + f * 0.007, 0.37, 0.176]), 0.0065, 0.0012, { bone: a.hand, surf: CLAW, blend: 0.003 });
    }
    s.chain([m([0.305, 0.48, 0.165]), m([0.298, 0.458, 0.19]), m([0.302, 0.442, 0.2])], [0.013, 0.011, 0.008], { bone: a.hand, surf: SKIN_DARK, blend: 0.008 });
  });

  // ── Legs ──
  s.both((x, m) => {
    const l = x === 1 ? legs.L : legs.R;
    s.limb(m([0.085, 0.55, 0.01]), m([0.105, 0.32, 0.08]), 0.065, 0.045, { bone: l.thigh, surf: SKIN, blend: 0.05 });
    s.sphere(m([0.105, 0.31, 0.088]), 0.042, { bone: l.shin, surf: SKIN_DARK, blend: 0.025 });
    s.ellipsoid(m([0.105, 0.24, 0.058]), [0.044, 0.07, 0.044], { bone: l.shin, surf: SKIN, blend: 0.03 });
    s.limb(m([0.105, 0.31, 0.08]), m([0.11, 0.09, 0.02]), 0.04, 0.029, { bone: l.shin, surf: SKIN, blend: 0.03 });
    s.ellipsoid(m([0.11, 0.045, 0.085]), [0.05, 0.034, 0.105], { bone: l.foot, surf: SKIN_DARK, blend: 0.03 });
    s.sphere(m([0.11, 0.05, 0.0]), 0.034, { bone: l.foot, surf: SKIN_DARK, blend: 0.03 });
    for (const t of [-1, 0, 1]) {
      const tx = 0.11 + t * 0.026;
      s.limb(m([tx, 0.04, 0.16]), m([tx + t * 0.008, 0.026, 0.205]), 0.018, 0.012, { bone: l.foot, surf: SKIN_DARK, blend: 0.012 });
      s.limb(m([tx + t * 0.008, 0.026, 0.205]), m([tx + t * 0.01, 0.012, 0.222]), 0.009, 0.002, { bone: l.foot, surf: CLAW, blend: 0.004 });
    }
  });

  // ── Belt with brass buckle and a ragged loincloth ──
  s.torus([0, 0.6, 0.035], 0.149, 0.018, { bone: hips, surf: LEATHER_DARK, blend: 0.006 });
  s.box([0, 0.6, 0.186], [0.03, 0.026, 0.012], 0.006, { bone: hips, surf: BRASS, blend: 0.004 });
  s.box([0, 0.48, 0.13], [0.075, 0.085, 0.012], 0.01, { bone: hips, surf: CLOTH, blend: 0.012, rx: 0.15, relief: { amp: 0.004, freq: 30, mode: 'folds' } });
  s.box([0, 0.48, -0.09], [0.085, 0.09, 0.012], 0.01, { bone: hips, surf: CLOTH, blend: 0.012, rx: -0.15, relief: { amp: 0.004, freq: 30, mode: 'folds' } });
  s.ellipsoid([-0.15, 0.53, 0.02], [0.05, 0.06, 0.045], { bone: hips, surf: LEATHER, blend: 0.006, relief: { amp: 0.003, freq: 35, mode: 'lumps' } });

  const material = createCreatureMaterial({ physical: true, sheen: 0.35, sheenColor: 0xc8c090 });
  const built = await s.buildAsync(material, voxelFor(1.2, ctx) * 0.85, undefined, ctx.job);
  const disposables: { dispose(): void }[] = [built.mesh.geometry, material];

  const eyes: THREE.Object3D[] = [];
  const headW = s.worldOf(head);
  for (const x of [1, -1]) {
    const eye = makeEye(0.023, 0xd9a227, { disposables, irisScale: 1.3 });
    eye.position.set(x * 0.052 - headW[0], 1.039 - headW[1], 0.24 - headW[2]);
    head.add(eye);
    eyes.push(eye);
  }

  const root = new THREE.Group();
  root.add(built.mesh);
  return {
    root,
    mesh: built.mesh,
    bones: built.bones,
    rest: captureRest(built.bones),
    eyes,
    glowMats: [],
    detailMats: [material],
    height: 1.2,
    gait: 'biped',
    pointWith: 'armR',
    // Crouched, hunched trickster's stance.
    posture: {
      spine: [0.12, 0, 0],
      chest: [0.14, 0, 0],
      neck: [-0.12, 0, 0],
      head: [-0.12, 0, 0],
      thighL: [-0.22, 0, 0.04],
      thighR: [-0.22, 0, -0.04],
      shinL: [0.42, 0, 0],
      shinR: [0.42, 0, 0],
      footL: [-0.2, 0, 0],
      footR: [-0.2, 0, 0],
      upperArmL: [-0.25, 0, 0.12],
      upperArmR: [-0.25, 0, -0.12],
      foreArmL: [-0.35, 0, 0],
      foreArmR: [-0.35, 0, 0],
    },
    postureDrop: 0.035,
    flying: false,
    hoverHeight: 0,
    magic: 0xb8ff6a,
    radius: 0.42,
    walkSpeed: 0.9,
    disposables,
  };
}
