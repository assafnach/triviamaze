import type { BuildContext, SkinnedRig } from '../rig';
import { arms, biped, face, finish, legs, neck, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const HIDE: Surface = { color: 0x6c7a6a, rough: 0.75, detail: 'stone' };
const HIDE_DARK: Surface = { color: 0x4e5a4c, rough: 0.8, detail: 'stone' };
const BELLY: Surface = { color: 0x8a8a74, rough: 0.7, detail: 'skin' };
const MOSS: Surface = { color: 0x4a6a24, rough: 0.95, detail: 'moss' };
const LIPS: Surface = { color: 0x5a524a, rough: 0.6, detail: 'skin' };
const TUSK: Surface = { color: 0xd8ccaa, rough: 0.35, detail: 'horn', hard: true };
const NAIL: Surface = { color: 0x3a3228, rough: 0.5, detail: 'horn', hard: true };
const HIDE_CLOTH: Surface = { color: 0x5a4030, rough: 0.85, detail: 'fur', hard: true };
const ROPE: Surface = { color: 0x7a6040, rough: 0.85, detail: 'cloth', hard: true };
const WOOD: Surface = { color: 0x4a3626, rough: 0.8, detail: 'bark', hard: true };

/** Grombul, troll of the pass: a hulking, stone-skinned brute with moss on his shoulders and a tree-trunk club. */
export async function buildTroll(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 2.3,
    hip: 1.0,
    shoulder: 1.72,
    shoulderW: 0.36,
    hipW: 0.17,
    head: [0, 1.96, 0.3],
    headR: 0.17,
    chestZ: 0.12,
    arm: [0.5, 0.46, 0.26],
    armSpread: 0.42,
  });
  s.bone('earL', [0.2, 1.98, 0.3], b.head);
  s.bone('earR', [-0.2, 1.98, 0.3], b.head);
  const lumps = { amp: 0.012, freq: 9, mode: 'lumps' as const };
  torso(b, { surf: HIDE, chest: [0.4, 0.32, 0.3], belly: [0.38, 0.3, 0.36], pelvis: [0.31, 0.2, 0.26], bellySurf: BELLY, relief: lumps });
  // Hunched shoulders and a heavy back.
  s.ellipsoid([0, 1.72, -0.06], [0.42, 0.22, 0.26], { bone: b.chest, surf: HIDE_DARK, blend: 0.12, relief: lumps });
  neck(b, HIDE, 0.12);
  const f = face(b, {
    skin: HIDE,
    skull: [0.17 * 0.95, 0.17 * 0.85, 0.17 * 0.95],
    brow: 1.2,
    browSurf: HIDE_DARK,
    nose: 'broad',
    noseLen: 0.65,
    lips: LIPS,
    mouthW: 0.5,
    ears: 'elf',
    earSize: 0.75,
    earInner: { color: 0x7a6a5a, rough: 0.7, detail: 'skin' },
    eyeR: 0.016,
    eyeX: 0.32,
    lids: 0.65,
    chin: 1.35,
    relief: lumps,
  });
  // Tusks jutting up from the lower jaw.
  for (const x of [1, -1]) {
    const base: V3 = v3.add(f.mouth, [x * 0.055, -0.03, -0.01]);
    s.chain([base, v3.add(base, [x * 0.012, 0.045, 0.02]), v3.add(base, [x * 0.02, 0.075, 0.012])], [0.014, 0.011, 0.004], { bone: b.jaw, surf: TUSK, blend: 0.004 });
  }
  // Moss growing on the head and shoulders.
  s.paintSphere(v3.add(b.spec.head, [0, 0.14, -0.04]), 0.12, MOSS, 0.04);
  s.paintSphere([0.3, 1.82, -0.04], 0.16, MOSS, 0.05);
  s.paintSphere([-0.22, 1.86, -0.1], 0.13, MOSS, 0.05);
  arms(b, {
    surf: HIDE,
    r: [0.13, 0.11, 0.085],
    muscle: 1.3,
    relief: lumps,
    hand: { surf: HIDE, fingers: 4, fingerR: 0.026, fingerLen: 0.6, curl: 0.5, claw: NAIL, knuckle: HIDE_DARK },
  });
  legs(b, { surf: HIDE, r: [0.16, 0.12, 0.1], foot: 'bare', toes: 4, claw: NAIL, relief: lumps });
  // Hide loincloth on a rope belt.
  s.torus([0, 1.04, 0.04], 0.3, 0.02, { bone: b.hips, surf: ROPE, blend: 0.01 });
  s.box([0, 0.86, 0.26], [0.17, 0.17, 0.02], 0.015, { bone: b.hips, surf: HIDE_CLOTH, blend: 0.015, rx: 0.12, relief: { amp: 0.006, freq: 14, mode: 'folds' } });
  s.box([0, 0.86, -0.2], [0.2, 0.17, 0.02], 0.015, { bone: b.hips, surf: HIDE_CLOTH, blend: 0.015, rx: -0.12, relief: { amp: 0.006, freq: 14, mode: 'folds' } });
  // A tree-trunk club in the left hand, resting on the ground.
  const grip = v3.mix(b.arms.L.wrist, b.arms.L.tip, 0.5);
  const head: V3 = [grip[0] + 0.12, 0.12, grip[2] + 0.28];
  s.chain([v3.add(grip, [0, 0.12, -0.02]), v3.mix(grip, head, 0.5), head], [0.045, 0.07, 0.12], { bone: b.arms.L.hand, surf: WOOD, blend: 0.02, relief: { amp: 0.01, freq: 18, mode: 'grooves' } });
  for (let i = 0; i < 3; i++) s.limb(v3.add(head, [0, 0.02 * i, 0]), v3.add(head, [Math.cos(i * 2.1) * 0.12, 0.08, Math.sin(i * 2.1) * 0.12]), 0.025, 0.008, { bone: b.arms.L.hand, surf: WOOD, blend: 0.01 });
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0xc8a030,
      irisScale: 1.4,
      material: { sheen: 0.15, sheenColor: 0xa0b098 },
      headDetail: { center: [0, 1.94, 0.36], half: [0.24, 0.22, 0.25], scale: 0.5 },
    },
    {
      height: 2.3,
      gait: 'biped',
      pointWith: 'armR',
      posture: {
        spine: [0.1, 0, 0],
        chest: [0.14, 0, 0],
        neck: [-0.14, 0, 0],
        head: [-0.1, 0, 0],
        thighL: [-0.12, 0, 0.05],
        thighR: [-0.12, 0, -0.05],
        shinL: [0.22, 0, 0],
        shinR: [0.22, 0, 0],
        footL: [-0.1, 0, 0],
        footR: [-0.1, 0, 0],
      },
      postureDrop: 0.03,
      flying: false,
      hoverHeight: 0,
      magic: 0xa8e070,
      radius: 0.65,
      walkSpeed: 0.7,
    },
  );
}
