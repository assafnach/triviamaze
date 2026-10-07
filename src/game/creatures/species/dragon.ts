import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, finish, quadLegs, quadruped, tail, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SCALES: Surface = { color: 0x7a2a1c, rough: 0.5, detail: 'scales' };
const SCALES_DARK: Surface = { color: 0x4a1a14, rough: 0.55, detail: 'scales' };
const LAVA: Surface = { color: 0x2a1410, rough: 0.8, detail: 'lava' };
const BELLY: Surface = { color: 0xc88a4a, rough: 0.55, detail: 'horn' };
const HORN: Surface = { color: 0x2c2420, rough: 0.35, detail: 'horn', hard: true };
const CLAW: Surface = { color: 0x1c1612, rough: 0.35, detail: 'horn', hard: true };
const MEMBRANE: Surface = { color: 0xa84a2a, rough: 0.6, detail: 'skin' };
const MOUTH: Surface = { color: 0x3a1010, rough: 0.6, detail: 'skin' };
const TOOTH: Surface = { color: 0xe8dcc0, rough: 0.3, detail: 'horn', hard: true };

/** Gakhli, a dragon cub: oversized head and paws, ember-cracked chest, stubby wings, a curling tail. */
export async function buildDragon(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const q = quadruped(s, {
    shoulder: 0.56,
    hip: 0.5,
    frontZ: 0.22,
    backZ: -0.3,
    legW: 0.14,
    head: [0, 0.98, 0.52],
    headR: 0.15,
    neckBase: [0, 0.66, 0.3],
    tail: [
      [0, 0.5, -0.42],
      [0, 0.42, -0.62],
      [0.06, 0.3, -0.82],
      [0.16, 0.2, -0.98],
      [0.3, 0.14, -1.08],
      [0.44, 0.13, -1.1],
    ],
  });
  const wing = { L: s.bone('wingL', [0.12, 0.74, 0.1], q.chest), R: s.bone('wingR', [-0.12, 0.74, 0.1], q.chest) };
  // Body: deep chest, round belly, strong haunches.
  s.ellipsoid([0, 0.62, 0.18], [0.2, 0.21, 0.24], { bone: q.chest, surf: SCALES, blend: 0.08 });
  s.ellipsoid([0, 0.54, -0.06], [0.2, 0.2, 0.26], { bone: q.spine, surf: SCALES, blend: 0.08 });
  s.ellipsoid([0, 0.54, -0.3], [0.18, 0.18, 0.2], { bone: q.hips, surf: SCALES, blend: 0.08 });
  // Ember-cracked chest and belly plates.
  s.paintEllipsoid([0, 0.52, 0.26], [0.16, 0.2, 0.16], LAVA, 0.05);
  s.paintEllipsoid([0, 0.66, 0.0], [0.17, 0.08, 0.2], LAVA, 0.05);
  s.paintEllipsoid([0, 0.42, -0.05], [0.14, 0.12, 0.24], BELLY, 0.04);
  // Neck.
  s.chain([[0, 0.62, 0.26], [0, 0.78, 0.38], [0, 0.9, 0.46]], [0.12, 0.1, 0.09], { bone: q.neck, surf: SCALES, blend: 0.05 });
  s.paintLimb([0, 0.62, 0.34], [0, 0.86, 0.5], 0.08, 0.06, LAVA, 0.03);
  // Head: wedge-shaped skull, brow ridges, long tapering snout, hinged jaw with a side-to-side mouth line.
  const h = q.spec.head;
  s.ellipsoid(h, [0.11, 0.1, 0.13], { bone: q.head, surf: SCALES, blend: 0.04 });
  s.limb(v3.add(h, [0, 0.0, 0.06]), v3.add(h, [0, -0.03, 0.27]), 0.085, 0.045, { bone: q.head, surf: SCALES, blend: 0.04 });
  s.ellipsoid(v3.add(h, [0, -0.025, 0.28]), [0.05, 0.035, 0.035], { bone: q.head, surf: SCALES, blend: 0.025 });
  for (const [, x] of SIDES) {
    s.carveEllipsoid(v3.add(h, [x * 0.022, -0.012, 0.31]), [0.006, 0.004, 0.006], 0.003);
    // Brow ridges over the eyes.
    s.limb(v3.add(h, [x * 0.035, 0.065, 0.07]), v3.add(h, [x * 0.08, 0.06, 0.13]), 0.022, 0.016, { bone: q.head, surf: SCALES_DARK, blend: 0.02 });
  }
  // Lower jaw (opens when speaking); the mouth line runs back along both sides.
  s.limb(v3.add(h, [0, -0.07, 0.0]), v3.add(h, [0, -0.07, 0.25]), 0.06, 0.035, { bone: q.jaw, surf: SCALES, blend: 0.03 });
  s.paintLimb(v3.add(h, [0, -0.1, 0.02]), v3.add(h, [0, -0.08, 0.22]), 0.04, 0.025, { color: 0xc88a4a, rough: 0.55, detail: 'horn' }, 0.015);
  for (const [, x] of SIDES) {
    s.carveLimb(v3.add(h, [x * 0.07, -0.05, 0.04]), v3.add(h, [x * 0.035, -0.045, 0.27]), 0.006, 0.005, 0.004);
    s.paintLimb(v3.add(h, [x * 0.07, -0.05, 0.04]), v3.add(h, [x * 0.035, -0.045, 0.27]), 0.01, 0.009, MOUTH, 0.004);
    for (let i = 0; i < 3; i++) s.limb(v3.add(h, [x * (0.055 - i * 0.008), -0.05, 0.12 + i * 0.05]), v3.add(h, [x * (0.055 - i * 0.008), -0.068, 0.12 + i * 0.05]), 0.005, 0.0015, { bone: q.head, surf: TOOTH, blend: 0.002 });
    // Swept-back horns and cheek frills.
    s.chain([v3.add(h, [x * 0.06, 0.07, -0.03]), v3.add(h, [x * 0.09, 0.12, -0.13]), v3.add(h, [x * 0.1, 0.12, -0.25])], [0.024, 0.016, 0.004], { bone: q.head, surf: HORN, blend: 0.01 });
    s.blade(v3.add(h, [x * 0.1, -0.03, -0.05]), [x, 0.2, -0.8], [0, 1, 0], 0.06, 0.035, 0.01, { bone: q.head, surf: MEMBRANE, blend: 0.012 });
  }
  // Ridge of spines down the back to the tail.
  const ridge: V3[] = [
    v3.add(h, [0, 0.12, -0.06]),
    [0, 0.84, 0.36],
    [0, 0.74, 0.22],
    [0, 0.76, 0.02],
    [0, 0.74, -0.18],
    [0, 0.7, -0.34],
    [0, 0.58, -0.52],
  ];
  ridge.forEach((p, i) => s.cone(p, 0.035 + (i % 2) * 0.01, 0.024, 0.002, { bone: i < 2 ? q.neck : i < 4 ? q.chest : q.hips, surf: HORN, blend: 0.012 }));
  quadLegs(q, { surf: SCALES, paw: SCALES_DARK, claw: CLAW, r: [0.07, 0.055, 0.06], toes: 3 });
  tail(q, q.spec.tail, [0.12, 0.09, 0.07, 0.05, 0.035, 0.02], SCALES);
  s.blade([0.48, 0.13, -1.1], [1, 0, -0.2], [0, 1, 0], 0.06, 0.05, 0.012, { bone: q.tail[5]!, surf: SCALES_DARK, blend: 0.01 });
  // Stubby bat wings folded on the back: a finger bone chain with a membrane.
  for (const [side, x] of SIDES) {
    const wb = wing[side];
    const root: V3 = [x * 0.12, 0.74, 0.1];
    const elbow: V3 = [x * 0.24, 0.86, -0.04];
    const tip: V3 = [x * 0.2, 0.84, -0.32];
    s.chain([root, elbow, tip], [0.03, 0.022, 0.01], { bone: wb, surf: SCALES_DARK, blend: 0.015 });
    s.blade(v3.mix(v3.mix(root, elbow, 0.5), tip, 0.45), v3.sub(tip, root), [x, 0.8, 0], 0.2, 0.09, 0.013, { bone: wb, surf: MEMBRANE, blend: 0.012 });
  }
  // Eyes set on the sides of the skull, looking forward and out.
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(h, [x * 0.072, 0.03, 0.1]) as V3, r: 0.022, bone: q.head }));
  for (const [i, e] of eyes.entries()) {
    const x = i === 0 ? 1 : -1;
    s.sphere(e.pos, 0.025, { bone: q.head, surf: SCALES_DARK, blend: 0.005 });
    s.carveEllipsoid(v3.add(e.pos, [x * 0.012, 0.003, 0.018]), [0.016, 0.012, 0.014], 0.003);
  }
  return finish(
    s,
    {
      ctx,
      eyes,
      iris: 0xffb020,
      pupil: 'slit',
      eyeGlow: 0.6,
      irisScale: 1.6,
      material: { sheen: 0.15, sheenColor: 0xff9060 },
      headDetail: { center: v3.add(h, [0, 0, 0.08]), half: [0.17, 0.17, 0.25], scale: 0.62 },
    },
    {
      height: 1.1,
      gait: 'quadruped',
      pointWith: 'wing',
      posture: { neck: [-0.1, 0, 0], head: [0.15, 0, 0] },
      flying: false,
      hoverHeight: 0,
      magic: 0xff9a3a,
      radius: 0.5,
      walkSpeed: 0.8,
    },
  );
}
