import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, arms, beard, biped, face, finish, hood, sleeve, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SPECTRAL: Surface = { color: 0xb8d8f0, rough: 0.6, detail: 'ghost', emissive: 0x3a6a9a, glow: 0.7 };
const SPECTRAL_DEEP: Surface = { color: 0x7aa0c8, rough: 0.6, detail: 'ghost', emissive: 0x2a4a7a, glow: 0.6 };
const FACE: Surface = { color: 0xd8e8f4, rough: 0.5, detail: 'skin', emissive: 0x4a7aa8, glow: 0.5 };
const BEARD: Surface = { color: 0xe8f4ff, rough: 0.7, detail: 'ghost', emissive: 0x6a9ac8, glow: 0.6, hard: true };
const RIM: Surface = { color: 0xd8c070, rough: 0.3, detail: 'metal', emissive: 0x6a5a20, glow: 0.4, hard: true };
const COVER: Surface = { color: 0x5a3a6a, rough: 0.6, detail: 'cloth', emissive: 0x2a1a3a, glow: 0.5, hard: true };
const PAGES: Surface = { color: 0xf0e8d0, rough: 0.8, detail: 'cloth', emissive: 0x8a8060, glow: 0.4, hard: true };

/** Lord Dafdefet, ghost of the librarian: a translucent old scholar with spectacles and a wispy beard, an open book in hand. */
export async function buildGhost(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.95,
    hip: 1.0,
    shoulder: 1.55,
    shoulderW: 0.19,
    hipW: 0.09,
    head: [0, 1.73, 0.08],
    headR: 0.11,
    chestZ: 0.04,
    arm: [0.3, 0.27, 0.17],
    armSpread: 0.3,
  });
  torso(b, { surf: SPECTRAL, chest: [0.19, 0.17, 0.14], belly: [0.18, 0.16, 0.15], pelvis: [0.18, 0.13, 0.14] });
  // Robes that fray into a drifting tail instead of legs.
  const tailPts: V3[] = [
    [0, 0.95, 0],
    [0, 0.62, -0.06],
    [0.04, 0.34, -0.18],
    [-0.02, 0.12, -0.34],
    [0.06, 0.02, -0.5],
  ];
  s.chain(tailPts, [0.24, 0.26, 0.2, 0.12, 0.03], { bone: b.hips, surf: SPECTRAL_DEEP, blend: 0.08, relief: { amp: 0.014, freq: 7, mode: 'folds' } });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    s.limb([Math.cos(a) * 0.16, 0.5, Math.sin(a) * 0.14], [Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2 - 0.08], 0.06, 0.008, { bone: b.hips, surf: SPECTRAL_DEEP, blend: 0.04 });
  }
  hood(b, { surf: SPECTRAL, peak: 0.4 });
  const f = face(b, {
    skin: FACE,
    brow: 0.7,
    browSurf: BEARD,
    nose: 'long',
    noseLen: 0.4,
    ears: 'none',
    eyeR: 0.0145,
    lids: 0.4,
    age: 1,
  });
  beard(b, f, { surf: BEARD, length: 0.42, width: 0.08 });
  // Round spectacles perched on the nose.
  for (const e of f.eyes) s.torus(v3.add(e.pos, [0, 0, 0.026]), 0.024, 0.0045, { bone: b.head, surf: RIM, blend: 0.002 });
  s.limb(v3.add(f.eyes[0]!.pos, [-0.022, 0.004, 0.026]), v3.add(f.eyes[1]!.pos, [0.022, 0.004, 0.026]), 0.004, 0.004, { bone: b.head, surf: RIM, blend: 0.002 });
  for (const side of ['L', 'R'] as const) sleeve(b, side, SPECTRAL, 1.9, { amp: 0.006, freq: 11, mode: 'folds' });
  arms(b, { surf: FACE, r: [0.04, 0.032, 0.024], covered: true, hand: { surf: FACE, fingers: 4, fingerR: 0.0075, fingerLen: 0.75, curl: 0.4 } });
  // An open book held before him in the left hand.
  const bookC: V3 = v3.add(v3.mix(b.arms.L.wrist, b.arms.L.tip, 0.6), [-0.08, 0.05, 0.08]);
  for (const [, x] of SIDES) {
    s.box(v3.add(bookC, [x * 0.07, 0, 0]), [0.07, 0.006, 0.1], 0.004, { bone: b.arms.L.hand, surf: COVER, blend: 0.003, ry: 0, rx: -0.6 });
    s.box(v3.add(bookC, [x * 0.065, 0.012, 0.0]), [0.06, 0.008, 0.09], 0.003, { bone: b.arms.L.hand, surf: PAGES, blend: 0.003, rx: -0.6 });
  }
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x9ad8ff,
      eyeGlow: 1.0,
      irisScale: 1.2,
      material: { transparent: true, opacity: 0.82, physical: false },
      headDetail: { center: [0, 1.7, 0.1], half: [0.15, 0.16, 0.16] },
    },
    {
      height: 1.95,
      gait: 'hover',
      pointWith: 'armR',
      posture: { spine: [0.06, 0, 0], chest: [0.08, 0, 0], head: [-0.05, 0, 0] },
      flying: true,
      hoverHeight: 0.2,
      magic: 0x9ad8ff,
      radius: 0.45,
      walkSpeed: 0,
    },
  );
}
