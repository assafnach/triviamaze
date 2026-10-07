import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, arms, biped, face, finish, neck, torso, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const BARK: Surface = { color: 0x5a4632, rough: 0.9, detail: 'bark' };
const BARK_DARK: Surface = { color: 0x3a2c20, rough: 0.92, detail: 'bark' };
const HEARTWOOD: Surface = { color: 0xb08a62, rough: 0.6, detail: 'skin' };
const MOSS: Surface = { color: 0x4f7a26, rough: 0.98, detail: 'moss' };
const LEAF: Surface = { color: 0x5f8a2c, rough: 0.7, detail: 'moss', hard: true };
const LEAF_GOLD: Surface = { color: 0xb08a2c, rough: 0.7, detail: 'moss', hard: true };
const BLOOM: Surface = { color: 0xf0d0e8, rough: 0.6, detail: 'skin', emissive: 0xffa0e0, glow: 0.35, hard: true };

const grain = { amp: 0.008, freq: 22, mode: 'grooves' as const };

/** Alona, spirit of the forest: a tall dryad of living wood, antlers of branches, leaf-hair and a skirt of roots. */
export async function buildSpirit(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 2.25,
    hip: 1.12,
    shoulder: 1.75,
    shoulderW: 0.17,
    hipW: 0.09,
    head: [0, 1.95, 0.04],
    headR: 0.11,
    chestZ: 0.02,
    arm: [0.34, 0.31, 0.2],
    armSpread: 0.32,
  });
  torso(b, { surf: BARK, chest: [0.15, 0.17, 0.11], belly: [0.11, 0.16, 0.1], pelvis: [0.15, 0.12, 0.12], bust: 0.045, relief: grain });
  neck(b, BARK, 0.045);
  const f = face(b, {
    skin: HEARTWOOD,
    skull: [0.11 * 0.82, 0.11 * 1.0, 0.11 * 0.95],
    brow: 0.3,
    nose: 'human',
    noseLen: 0.2,
    lips: { color: 0x8a5a3a, rough: 0.5, detail: 'skin' },
    mouthW: 0.26,
    ears: 'none',
    eyeR: 0.0135,
    lids: 0.3,
    chin: 0.8,
  });
  // Bark framing the smooth heartwood face.
  s.ellipsoid(v3.add(b.spec.head, [0, 0.05, -0.05]), [0.1, 0.11, 0.1], { bone: b.head, surf: BARK, blend: 0.02, relief: grain });
  // Antlers of branching twigs.
  for (const [, x] of SIDES) {
    const r0: V3 = v3.add(b.spec.head, [x * 0.06, 0.09, -0.02]);
    const r1: V3 = v3.add(r0, [x * 0.1, 0.16, -0.05]);
    const r2: V3 = v3.add(r1, [x * 0.12, 0.18, -0.08]);
    s.chain([r0, r1, r2], [0.022, 0.016, 0.006], { bone: b.head, surf: BARK_DARK, blend: 0.01, relief: grain });
    s.chain([r1, v3.add(r1, [x * 0.02, 0.15, 0.06]), v3.add(r1, [x * 0.0, 0.24, 0.1])], [0.012, 0.008, 0.003], { bone: b.head, surf: BARK_DARK, blend: 0.006 });
    s.chain([v3.mix(r1, r2, 0.5), v3.add(v3.mix(r1, r2, 0.5), [x * 0.12, 0.04, 0.02])], [0.01, 0.003], { bone: b.head, surf: BARK_DARK, blend: 0.005 });
    // Leaves and a pale bloom on the antlers.
    s.blade(v3.add(r2, [0, 0.02, 0]), [x, 0.3, 0.2], [0, 1, 0], 0.05, 0.025, 0.006, { bone: b.head, surf: LEAF, blend: 0.004 });
    s.sphere(v3.add(r1, [x * 0.02, 0.0, 0.03]), 0.02, { bone: b.head, surf: BLOOM, blend: 0.006 });
  }
  // Hair of leaves cascading down the back.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 1.6 + Math.PI * 0.2;
    const row = i % 3;
    const p: V3 = v3.add(b.spec.head, [Math.cos(a) * 0.1, 0.06 - row * 0.12 - (i % 5) * 0.03, -Math.sin(a) * 0.09 - 0.04]);
    const dir: V3 = [Math.cos(a) * 0.4, -1, -Math.sin(a) * 0.6 - 0.3];
    s.blade(p, dir, [Math.cos(a), 0, -Math.sin(a)], 0.07, 0.035, 0.007, { bone: row === 0 ? b.head : b.neck, surf: i % 7 === 0 ? LEAF_GOLD : LEAF, blend: 0.004 });
  }
  // Moss mantle over the shoulders.
  s.ellipsoid(v3.add(b.at.neckBase, [0, -0.06, -0.02]), [0.2, 0.07, 0.13], { bone: b.chest, surf: MOSS, blend: 0.03, relief: { amp: 0.008, freq: 30, mode: 'lumps' } });
  // Branch arms with twig fingers.
  arms(b, { surf: BARK, r: [0.04, 0.032, 0.022], muscle: 1.0, relief: grain, hand: { surf: BARK_DARK, fingers: 4, fingerR: 0.007, fingerLen: 0.95, curl: 0.2 } });
  // A skirt of roots spreading over the ground.
  s.limb([0, b.spec.hip + 0.05, 0], [0, 0.35, -0.02], 0.15, 0.24, { bone: b.hips, surf: BARK, blend: 0.08, relief: grain });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const p0: V3 = [out[0] * 0.18, 0.42, out[2] * 0.16];
    const p1: V3 = [out[0] * 0.32, 0.12, out[2] * 0.3];
    const p2: V3 = [out[0] * 0.55, 0.03, out[2] * 0.52];
    s.chain([p0, p1, p2], [0.06, 0.045, 0.015], { bone: b.hips, surf: i % 2 ? BARK_DARK : BARK, blend: 0.03, relief: grain });
  }
  s.paintSphere([0.12, 0.2, 0.22], 0.12, MOSS, 0.05);
  s.paintSphere([-0.2, 0.15, -0.1], 0.14, MOSS, 0.05);
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0xffc040,
      eyeGlow: 1.2,
      irisScale: 1.8,
      material: { sheen: 0.2, sheenColor: 0xc0e090 },
      headDetail: { center: v3.add(b.spec.head, [0, 0, 0.04]), half: [0.14, 0.15, 0.15] },
    },
    {
      height: 2.25,
      gait: 'hover',
      pointWith: 'armR',
      posture: { head: [0.05, 0, -0.06], spine: [0, 0, 0.04] },
      flying: false,
      hoverHeight: 0,
      magic: 0xb8ff6a,
      radius: 0.55,
      walkSpeed: 0.35,
    },
  );
}
