import type { BuildContext, SkinnedRig } from '../rig';
import { arms, biped, face, finish, hair, neck, pointedHat, robe, sleeve, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SKIN: Surface = { color: 0xc8a08a, rough: 0.55, detail: 'skin' };
const SKIN_DEEP: Surface = { color: 0xa87a68, rough: 0.55, detail: 'skin' };
const WART: Surface = { color: 0x8a6a52, rough: 0.6, detail: 'skin' };
const LIPS: Surface = { color: 0x9a6a62, rough: 0.5, detail: 'skin' };
const HAIR: Surface = { color: 0xb4b0a8, rough: 0.8, detail: 'fur', hard: true };
const HAT: Surface = { color: 0x2c2234, rough: 0.85, detail: 'cloth', hard: true };
const BAND: Surface = { color: 0x6a3a5a, rough: 0.7, detail: 'cloth', hard: true };
const ROBE: Surface = { color: 0x3a2c44, rough: 0.9, detail: 'cloth', hard: true };
const SHAWL: Surface = { color: 0x4f5a2c, rough: 0.95, detail: 'fur', hard: true };
const APRON: Surface = { color: 0x8a7a5c, rough: 0.9, detail: 'cloth', hard: true };
const HERB: Surface = { color: 0x5a7a2c, rough: 0.7, detail: 'moss', hard: true };
const FLOWER: Surface = { color: 0xb07ac0, rough: 0.6, detail: 'skin', hard: true };
const TWINE: Surface = { color: 0x9a7a4a, rough: 0.8, detail: 'cloth', hard: true };

/** Grandma Herb-witch: small, stooped and kindly, hooked nose, knitted shawl, a bundle of fresh herbs. */
export async function buildWitch(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.48,
    hip: 0.72,
    shoulder: 1.15,
    shoulderW: 0.17,
    hipW: 0.09,
    head: [0, 1.32, 0.11],
    headR: 0.112,
    chestZ: 0.06,
    arm: [0.24, 0.22, 0.14],
    armSpread: 0.35,
  });
  torso(b, { surf: ROBE, chest: [0.17, 0.15, 0.14], belly: [0.19, 0.16, 0.17], pelvis: [0.19, 0.13, 0.15] });
  neck(b, SKIN, 0.05);
  const f = face(b, {
    skin: SKIN,
    brow: 0.75,
    browSurf: HAIR,
    nose: 'hooked',
    noseLen: 0.55,
    noseSurf: SKIN_DEEP,
    lips: LIPS,
    mouthW: 0.3,
    ears: 'human',
    eyeR: 0.0135,
    lids: 0.45,
    age: 1,
    chin: 1.25,
    cheeks: { color: 0xd88878, rough: 0.5, detail: 'skin' },
  });
  // Warts on nose and chin.
  for (const w of [v3.add(f.noseTip, [0.012, 0.01, -0.005]), v3.add(f.chin, [-0.02, -0.005, 0.01])] as V3[]) s.sphere(w, 0.0075, { bone: w === f.chin ? b.jaw : b.head, surf: WART, blend: 0.004 });
  hair(b, { surf: HAIR, length: 0.12, volume: 1.08, crown: false });
  pointedHat(b, { surf: HAT, brim: 0.25, height: 0.5, droop: 0.85, band: BAND });
  robe(b, { surf: ROBE, top: 1.08, topR: [0.18, 0.16], hem: 0.02, hemR: [0.3, 0.28], folds: 0.016 });
  // Apron and knitted shawl.
  s.ellipsoid([0, 0.5, 0.2], [0.17, 0.36, 0.06], { bone: b.hips, surf: APRON, blend: 0.02, relief: { amp: 0.004, freq: 12, mode: 'folds' } });
  s.ellipsoid(v3.add(b.at.neckBase, [0, -0.08, -0.02]), [0.25, 0.1, 0.19], { bone: b.chest, surf: SHAWL, blend: 0.03, relief: { amp: 0.005, freq: 30, mode: 'lumps' } });
  s.limb(v3.add(b.at.neckBase, [0.05, -0.12, 0.13]), [0.02, 0.82, 0.22], 0.05, 0.02, { bone: b.chest, surf: SHAWL, blend: 0.02 });
  s.limb(v3.add(b.at.neckBase, [-0.05, -0.12, 0.13]), [-0.02, 0.84, 0.22], 0.05, 0.02, { bone: b.chest, surf: SHAWL, blend: 0.02 });
  for (const side of ['L', 'R'] as const) sleeve(b, side, ROBE, 1.5, { amp: 0.005, freq: 12, mode: 'folds' });
  arms(b, { surf: SKIN, r: [0.045, 0.036, 0.027], covered: true, hand: { surf: SKIN, fingers: 4, fingerR: 0.0085, fingerLen: 0.7, curl: 0.55, knuckle: SKIN_DEEP } });
  // A bundle of herbs held in the left hand.
  const grip = v3.mix(b.arms.L.wrist, b.arms.L.tip, 0.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top: V3 = v3.add(grip, [Math.cos(a) * 0.04, 0.18 + (i % 2) * 0.04, Math.sin(a) * 0.04 + 0.03]);
    s.limb(v3.add(grip, [0, -0.06, 0.02]), top, 0.004, 0.003, { bone: b.arms.L.hand, surf: HERB, blend: 0.002 });
    s.blade(top, [Math.cos(a), 0.6, Math.sin(a)], [0, 1, 0], 0.035, 0.014, 0.004, { bone: b.arms.L.hand, surf: i % 3 === 0 ? FLOWER : HERB, blend: 0.003 });
  }
  s.torus(v3.add(grip, [0, 0.01, 0.02]), 0.016, 0.005, { bone: b.arms.L.hand, surf: TWINE, blend: 0.002 });
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x7a9a4a,
      irisScale: 1.3,
      material: { sheen: 0.25, sheenColor: 0xd0c0b0 },
      headDetail: { center: [0, 1.32, 0.15], half: [0.15, 0.15, 0.2] },
    },
    {
      height: 1.48,
      gait: 'biped',
      pointWith: 'armR',
      posture: { spine: [0.12, 0, 0], chest: [0.16, 0, 0], neck: [-0.12, 0, 0], head: [-0.1, 0, 0] },
      postureDrop: 0.02,
      flying: false,
      hoverHeight: 0,
      magic: 0xc89aff,
      radius: 0.42,
      walkSpeed: 0.5,
    },
  );
}
