import type { BuildContext, SkinnedRig } from '../rig';
import { arms, biped, face, finish, hair, neck, robe, sleeve, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';

const SKIN: Surface = { color: 0xe2c2ac, rough: 0.45, detail: 'skin' };
const LIPS: Surface = { color: 0xb87a78, rough: 0.4, detail: 'skin' };
const HAIR: Surface = { color: 0xe6d8a8, rough: 0.55, detail: 'fur', hard: true };
const ROBE: Surface = { color: 0x2c5a40, rough: 0.82, detail: 'cloth', hard: true };
const ROBE_LIGHT: Surface = { color: 0xd8dccb, rough: 0.8, detail: 'cloth', hard: true };
const SILVER: Surface = { color: 0xc8ccd4, rough: 0.25, detail: 'metal', hard: true };
const GEM: Surface = { color: 0xa0ffe0, rough: 0.1, detail: 'crystal', emissive: 0x40ffc0, glow: 1.4, hard: true };

/** Lyria, elven prophetess: tall and slender, long pale hair, pointed ears, a silver circlet with a seeing-stone. */
export async function buildElf(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.86,
    hip: 0.98,
    shoulder: 1.53,
    shoulderW: 0.165,
    hipW: 0.085,
    head: [0, 1.71, 0.03],
    headR: 0.104,
    chestZ: 0.01,
    arm: [0.3, 0.27, 0.17],
    armSpread: 0.25,
  });
  s.bone('earL', [0.1, 1.7, 0.04], b.head);
  s.bone('earR', [-0.1, 1.7, 0.04], b.head);
  torso(b, { surf: ROBE, chest: [0.15, 0.15, 0.11], belly: [0.13, 0.14, 0.11], pelvis: [0.15, 0.11, 0.11], bust: 0.045 });
  neck(b, SKIN, 0.042);
  const f = face(b, {
    skin: SKIN,
    skull: [0.104 * 0.84, 0.104 * 0.97, 0.104 * 0.98],
    brow: 0.25,
    nose: 'human',
    noseLen: 0.22,
    lips: LIPS,
    mouthW: 0.28,
    ears: 'long',
    earSize: 0.9,
    earInner: { color: 0xd8a8a0, rough: 0.45, detail: 'skin' },
    eyeR: 0.0135,
    lids: 0.2,
    chin: 0.75,
    cheeks: { color: 0xe0a8a0, rough: 0.45, detail: 'skin' },
  });
  hair(b, { surf: HAIR, length: 0.55, volume: 1.04 });
  // Silver circlet with a glowing seeing-stone on the brow.
  s.torus(v3.add(b.spec.head, [0, 0.055, -0.01]), 0.093, 0.006, { bone: b.head, surf: SILVER, blend: 0.003 });
  s.ellipsoid(v3.add(f.brow, [0, 0.035, 0.015]), [0.011, 0.014, 0.008], { bone: b.head, surf: GEM, blend: 0.003 });
  robe(b, { surf: ROBE, top: 1.46, topR: [0.16, 0.12], hem: 0.02, hemR: [0.3, 0.26], folds: 0.014, belt: SILVER, trim: ROBE_LIGHT });
  for (const side of ['L', 'R'] as const) sleeve(b, side, ROBE_LIGHT, 2.1, { amp: 0.005, freq: 11, mode: 'folds' });
  arms(b, { surf: SKIN, r: [0.042, 0.034, 0.024], covered: true, hand: { surf: SKIN, fingers: 4, fingerR: 0.0075, fingerLen: 0.75, curl: 0.25 } });
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x3fae86,
      irisScale: 1.25,
      eyeGlow: 0.25,
      material: { sheen: 0.35, sheenColor: 0xffe0d0 },
      headDetail: { center: [0, 1.7, 0.05], half: [0.2, 0.15, 0.16] },
    },
    {
      height: 1.86,
      gait: 'biped',
      pointWith: 'armR',
      posture: { head: [0.04, 0, 0.04] },
      flying: false,
      hoverHeight: 0,
      magic: 0x8cffd8,
      radius: 0.4,
      walkSpeed: 0.7,
    },
  );
}
