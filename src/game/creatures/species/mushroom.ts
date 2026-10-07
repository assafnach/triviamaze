import * as THREE from 'three';
import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, arms, biped, face, finish, legs, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const STEM: Surface = { color: 0xe6dcc4, rough: 0.7, detail: 'skin' };
const STEM_SHADE: Surface = { color: 0xc8b898, rough: 0.75, detail: 'skin' };
const CAP: Surface = { color: 0x9a3a24, rough: 0.45, detail: 'skin', hard: true };
const SPOT: Surface = { color: 0xf2ead8, rough: 0.6, detail: 'skin', hard: true };
const GILL: Surface = { color: 0xd8c0a0, rough: 0.8, detail: 'cloth', hard: true };
const LIPS: Surface = { color: 0xb08068, rough: 0.6, detail: 'skin' };
const MOSS: Surface = { color: 0x4f7a26, rough: 0.98, detail: 'moss' };
const GLOW: Surface = { color: 0xd8ffc0, rough: 0.5, detail: 'skin', emissive: 0x9aff6a, glow: 1.2, hard: true };

/** Kmehon, the mushroom-folk: a stout, gentle stem-body under a broad spotted cap, little glowing mushrooms at his feet. */
export async function buildMushroom(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 1.35,
    hip: 0.36,
    shoulder: 0.78,
    shoulderW: 0.2,
    hipW: 0.1,
    head: [0, 0.86, 0.1],
    headR: 0.13,
    chestZ: 0.02,
    arm: [0.2, 0.18, 0.1],
    armSpread: 0.5,
  });
  // A thick, slightly bulging stem forms the body.
  s.limb([0, 0.34, 0], [0, 0.9, 0.02], 0.22, 0.19, { bone: b.spine, surf: STEM, blend: 0.06, relief: { amp: 0.006, freq: 18, mode: 'grooves' } });
  s.ellipsoid([0, 0.5, 0.03], [0.24, 0.2, 0.22], { bone: b.hips, surf: STEM, blend: 0.08 });
  s.paintEllipsoid([0, 0.4, -0.05], [0.25, 0.12, 0.25], STEM_SHADE, 0.08);
  // Ring (annulus) around the stem like a little collar.
  s.torus([0, 0.74, 0.02], 0.2, 0.025, { bone: b.chest, surf: STEM_SHADE, blend: 0.02, relief: { amp: 0.004, freq: 20, mode: 'folds' } });
  const f = face(b, {
    skin: STEM,
    skull: [0.13 * 0.9, 0.13 * 0.85, 0.13 * 0.8],
    brow: 0.2,
    nose: 'button',
    noseLen: 0.3,
    lips: LIPS,
    mouthW: 0.3,
    ears: 'none',
    eyeR: 0.019,
    eyeY: 0.05,
    lids: 0.2,
    chin: 0.6,
    cheeks: { color: 0xe8a890, rough: 0.6, detail: 'skin' },
  });
  // The cap: a broad dome with a rolled rim, gills beneath and pale spots on top.
  // (Built without carving: a carve would also cut the face below.)
  const capC: V3 = [0, 1.14, 0.0];
  s.ellipsoid(capC, [0.46, 0.2, 0.44], { bone: b.head, surf: CAP, blend: 0.05, relief: { amp: 0.008, freq: 7, mode: 'lumps' } });
  s.torus(v3.add(capC, [0, -0.07, 0]), 0.41, 0.045, { bone: b.head, surf: CAP, blend: 0.04 });
  s.ellipsoid(v3.add(capC, [0, -0.1, 0]), [0.4, 0.03, 0.38], { bone: b.head, surf: GILL, blend: 0.01, relief: { amp: 0.006, freq: 40, mode: 'ridges' } });
  const spots: V3[] = [
    [0, 0.24, 0.0],
    [0.2, 0.17, 0.18],
    [-0.22, 0.16, 0.12],
    [0.08, 0.2, -0.22],
    [-0.15, 0.15, -0.26],
    [0.3, 0.1, -0.12],
    [-0.32, 0.08, -0.05],
    [0.05, 0.13, 0.3],
  ];
  for (const sp of spots) s.ellipsoid(v3.add(capC, [sp[0], sp[1] * 0.8, sp[2]]), [0.045, 0.02, 0.045], { bone: b.head, surf: SPOT, blend: 0.012 });
  s.paintSphere(v3.add(capC, [-0.28, 0.1, 0.2]), 0.08, MOSS, 0.03);
  arms(b, { surf: STEM, r: [0.045, 0.04, 0.032], muscle: 1.0, hand: { surf: STEM, fingers: 3, fingerR: 0.012, fingerLen: 0.6, curl: 0.4 } });
  legs(b, { surf: STEM_SHADE, r: [0.07, 0.06, 0.05], foot: 'bare', toes: 3 });
  // Tiny glowing toadstools sprouting from his shoulder.
  for (const [, x] of SIDES) {
    const p: V3 = [x * 0.16, 0.86, -0.04];
    s.limb(p, v3.add(p, [0, 0.06, 0]), 0.008, 0.006, { bone: b.chest, surf: STEM, blend: 0.004 });
    s.ellipsoid(v3.add(p, [0, 0.07, 0]), [0.025, 0.012, 0.025], { bone: b.chest, surf: GLOW, blend: 0.004 });
  }
  const rig = await finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x6a4a2a,
      irisScale: 1.6,
      material: { sheen: 0.5, sheenColor: 0xfff0e0 },
      headDetail: { center: [0, 0.9, 0.12], half: [0.18, 0.16, 0.16] },
    },
    {
      height: 1.35,
      gait: 'biped',
      pointWith: 'armR',
      posture: { upperArmL: [0, 0, 0.25], upperArmR: [0, 0, -0.25] },
      flying: false,
      hoverHeight: 0,
      magic: 0xb8ff8a,
      radius: 0.5,
      walkSpeed: 0.45,
    },
  );
  void THREE;
  return rig;
}
