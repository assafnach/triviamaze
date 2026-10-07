import type { BuildContext, SkinnedRig } from '../rig';
import { arms, beard, biped, face, finish, hair, neck, pointedHat, robe, sleeve, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SKIN: Surface = { color: 0xc49a80, rough: 0.55, detail: 'skin' };
const SKIN_DEEP: Surface = { color: 0xa87862, rough: 0.55, detail: 'skin' };
const LIPS: Surface = { color: 0x9a6458, rough: 0.5, detail: 'skin' };
const BEARD: Surface = { color: 0xd8d4cc, rough: 0.85, detail: 'fur', hard: true };
const ROBE: Surface = { color: 0x23325e, rough: 0.88, detail: 'cloth', hard: true };
const GOLD: Surface = { color: 0xb58a3c, rough: 0.35, detail: 'metal', hard: true };
const ROPE: Surface = { color: 0x8a6a42, rough: 0.8, detail: 'cloth', hard: true };
const WOOD: Surface = { color: 0x4a3322, rough: 0.75, detail: 'bark', hard: true };
const CRYSTAL: Surface = { color: 0x9fd6ff, rough: 0.12, detail: 'crystal', emissive: 0x5ab8ff, glow: 1.6, hard: true };

/** Meron, the old wizard: stooped, long white beard, star-blue robe, gnarled staff with a glowing crystal. */
export async function buildWizard(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.74,
    hip: 0.9,
    shoulder: 1.43,
    shoulderW: 0.19,
    hipW: 0.09,
    head: [0, 1.6, 0.06],
    headR: 0.118,
    chestZ: 0.03,
    arm: [0.29, 0.26, 0.17],
    armSpread: 0.3,
  });
  torso(b, { surf: ROBE, chest: [0.18, 0.17, 0.13], belly: [0.17, 0.15, 0.14], pelvis: [0.17, 0.12, 0.13] });
  neck(b, SKIN, 0.055);
  const f = face(b, {
    skin: SKIN,
    brow: 0.55,
    browSurf: BEARD,
    nose: 'long',
    noseLen: 0.42,
    noseSurf: SKIN_DEEP,
    lips: LIPS,
    ears: 'human',
    earSize: 1.1,
    eyeR: 0.0158,
    lids: 0.35,
    age: 1,
    cheeks: { color: 0xc08070, rough: 0.5, detail: 'skin' },
  });
  hair(b, { surf: BEARD, length: 0.16, volume: 0.95, crown: false });
  beard(b, f, { surf: BEARD, length: 0.36, width: 0.085 });
  pointedHat(b, { surf: ROBE, brim: 0.21, height: 0.44, droop: 0.55, band: GOLD });
  robe(b, { surf: ROBE, top: 1.36, topR: [0.19, 0.15], hem: 0.03, hemR: [0.34, 0.3], folds: 0.016, belt: ROPE, trim: GOLD });
  for (const side of ['L', 'R'] as const) sleeve(b, side, ROBE, 1.8, { amp: 0.006, freq: 11, mode: 'folds' });
  arms(b, {
    surf: SKIN,
    r: [0.05, 0.04, 0.03],
    muscle: 1.0,
    covered: true,
    hand: { surf: SKIN, fingers: 4, fingerR: 0.009, fingerLen: 0.65, curl: 0.45, knuckle: SKIN_DEEP },
  });
  // Gnarled staff gripped in the left hand, crowned by a glowing crystal in a root cage.
  const grip = v3.mix(b.arms.L.wrist, b.arms.L.tip, 0.55);
  const foot: V3 = [grip[0] + 0.05, 0.02, grip[2] + 0.06];
  const top: V3 = [grip[0] - 0.01, 1.92, grip[2] + 0.02];
  s.chain([foot, v3.mix(foot, top, 0.35), v3.mix(foot, top, 0.7), top], [0.018, 0.02, 0.022, 0.03], {
    bone: b.arms.L.hand,
    surf: WOOD,
    blend: 0.01,
    relief: { amp: 0.004, freq: 30, mode: 'grooves' },
  });
  s.ellipsoid(v3.add(top, [0, 0.1, 0]), [0.035, 0.07, 0.035], { bone: b.arms.L.hand, surf: CRYSTAL, blend: 0.004 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    s.chain([v3.add(top, [Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02]), v3.add(top, [Math.cos(a) * 0.05, 0.08, Math.sin(a) * 0.05]), v3.add(top, [Math.cos(a) * 0.02, 0.17, Math.sin(a) * 0.02])], [0.01, 0.009, 0.005], {
      bone: b.arms.L.hand,
      surf: WOOD,
      blend: 0.004,
    });
  }
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x5f86b4,
      irisScale: 1.3,
      material: { sheen: 0.2, sheenColor: 0x9aa6c8 },
      headDetail: { center: [0, 1.58, 0.1], half: [0.15, 0.16, 0.17] },
    },
    {
      height: 1.74,
      gait: 'biped',
      pointWith: 'armR',
      posture: { spine: [0.08, 0, 0], chest: [0.1, 0, 0], neck: [-0.06, 0, 0], head: [-0.08, 0, 0] },
      postureDrop: 0.01,
      flying: false,
      hoverHeight: 0,
      magic: 0x9fd0ff,
      radius: 0.45,
      walkSpeed: 0.6,
    },
  );
}
