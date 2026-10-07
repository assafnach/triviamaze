import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, biped, finish, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const STONE: Surface = { color: 0x8c8678, rough: 0.92, detail: 'stone' };
const STONE_DARK: Surface = { color: 0x5e5a52, rough: 0.95, detail: 'stone' };
const RUNE: Surface = { color: 0x77736a, rough: 0.9, detail: 'runes' };
const MOSS: Surface = { color: 0x4a6624, rough: 0.98, detail: 'moss' };
const CORE: Surface = { color: 0x9ae0ff, rough: 0.2, detail: 'crystal', emissive: 0x4ab8ff, glow: 1.8 };

const cracks = { amp: 0.02, freq: 6, mode: 'cracks' as const };
const lumps = { amp: 0.025, freq: 5, mode: 'lumps' as const };

/** Sela, the stone golem: an ancient guardian of mortared boulders, rune-carved, mossy, with a glowing heart-stone. */
export async function buildGolem(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 2.4,
    hip: 0.95,
    shoulder: 1.74,
    shoulderW: 0.44,
    hipW: 0.2,
    head: [0, 2.0, 0.2],
    headR: 0.16,
    chestZ: 0.1,
    arm: [0.5, 0.48, 0.32],
    armSpread: 0.5,
  });
  const rock = (c: V3, r: V3, bone = b.chest, surf = STONE, blend = 0.025): void => {
    s.ellipsoid(c, r, { bone, surf, blend, relief: lumps });
  };
  // Torso: a great rune-carved chest slab, rocks stacked into a waist, a heavy pelvis stone.
  rock([0, 1.5, 0.08], [0.46, 0.34, 0.32], b.chest, RUNE, 0.04);
  s.paintSphere([0, 1.48, 0.38], 0.08, CORE, 0.03);
  s.carveSphere([0, 1.48, 0.42], 0.06, 0.02);
  s.sphere([0, 1.48, 0.36], 0.065, { bone: b.chest, surf: CORE, blend: 0.01 });
  rock([0.14, 1.16, 0.06], [0.2, 0.15, 0.2], b.spine, STONE_DARK);
  rock([-0.14, 1.14, 0.04], [0.19, 0.16, 0.19], b.spine);
  rock([0, 1.2, -0.1], [0.24, 0.16, 0.16], b.spine);
  rock([0, 0.94, 0.0], [0.34, 0.17, 0.26], b.hips, STONE_DARK);
  // Back: a hunched ridge of boulders.
  rock([0, 1.72, -0.12], [0.4, 0.2, 0.24], b.chest, STONE_DARK);
  // Head: a squat boulder sunk between the shoulders, a jutting brow slab, deep glowing sockets.
  const h = b.spec.head;
  rock(h, [0.17, 0.15, 0.16], b.head, STONE, 0.03);
  s.box(v3.add(h, [0, 0.05, 0.12]), [0.15, 0.04, 0.06], 0.02, { bone: b.head, surf: STONE_DARK, blend: 0.02, rx: -0.2 });
  s.ellipsoid(v3.add(h, [0, -0.08, 0.1]), [0.13, 0.07, 0.09], { bone: b.jaw, surf: STONE_DARK, blend: 0.02, relief: lumps });
  s.carveLimb(v3.add(h, [-0.07, -0.05, 0.19]), v3.add(h, [0.07, -0.05, 0.19]), 0.012, 0.012, 0.01);
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(h, [x * 0.06, 0.0, 0.12]) as V3, r: 0.022, bone: b.head }));
  for (const e of eyes) s.carveSphere(v3.add(e.pos, [0, 0, 0.02]), 0.034, 0.01);
  s.paintSphere(v3.add(h, [0, 0.14, 0]), 0.14, MOSS, 0.05);
  // Shoulders, arms and enormous fists.
  for (const [side, x] of SIDES) {
    const a = b.arms[side];
    rock(v3.add(a.shoulder, [x * 0.05, 0.05, 0]), [0.22, 0.2, 0.22], a.up, STONE, 0.03);
    s.paintSphere(v3.add(a.shoulder, [x * 0.05, 0.2, -0.04]), 0.16, MOSS, 0.05);
    rock(v3.mix(a.shoulder, a.elbow, 0.55), [0.14, 0.22, 0.14], a.up, STONE_DARK);
    rock(a.elbow, [0.13, 0.12, 0.13], a.fore);
    rock(v3.mix(a.elbow, a.wrist, 0.55), [0.16, 0.22, 0.16], a.fore, RUNE);
    const fist = v3.mix(a.wrist, a.tip, 0.45);
    rock(fist, [0.17, 0.2, 0.17], a.hand, STONE, 0.03);
    for (let i = 0; i < 3; i++) {
      const fx = (i - 1) * 0.09;
      s.ellipsoid(v3.add(fist, [fx * x, -0.17, 0.1]), [0.055, 0.07, 0.06], { bone: a.hand, surf: STONE_DARK, blend: 0.02, relief: lumps });
    }
    s.ellipsoid(v3.add(fist, [-x * 0.14, -0.05, 0.1]), [0.05, 0.08, 0.05], { bone: a.hand, surf: STONE_DARK, blend: 0.02 });
  }
  // Legs: stacked pillar stones on slab feet.
  for (const [side] of SIDES) {
    const l = b.legs[side];
    rock(v3.mix(l.hip, l.knee, 0.5), [0.17, 0.25, 0.17], l.thigh, STONE);
    rock(l.knee, [0.14, 0.12, 0.15], l.shin, STONE_DARK);
    rock(v3.mix(l.knee, l.ankle, 0.55), [0.15, 0.22, 0.15], l.shin, STONE);
    s.box([l.ankle[0], 0.09, l.ankle[2] + 0.1], [0.16, 0.09, 0.24], 0.05, { bone: l.foot, surf: STONE_DARK, blend: 0.03, relief: cracks });
  }
  return finish(
    s,
    { ctx, eyes, iris: 0x7ad8ff, eyeGlow: 2.2, irisScale: 2.2, material: { sheen: 0, physical: true } },
    {
      height: 2.4,
      gait: 'biped',
      pointWith: 'armR',
      posture: { spine: [0.08, 0, 0], chest: [0.12, 0, 0], neck: [-0.15, 0, 0], head: [-0.05, 0, 0], upperArmL: [0, 0, 0.15], upperArmR: [0, 0, -0.15] },
      postureDrop: 0.02,
      flying: false,
      hoverHeight: 0,
      magic: 0x7ad8ff,
      radius: 0.7,
      walkSpeed: 0.55,
    },
  );
}
