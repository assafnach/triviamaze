import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, biped, finish, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const ROCK: Surface = { color: 0x4a4658, rough: 0.8, detail: 'stone' };
const ROCK_LIGHT: Surface = { color: 0x6a6684, rough: 0.75, detail: 'stone' };
const CRYSTAL: Surface = { color: 0xd8b8ff, rough: 0.08, detail: 'crystal', emissive: 0x9a6aff, glow: 1.3, hard: true };
const CRYSTAL_BLUE: Surface = { color: 0xb8e4ff, rough: 0.08, detail: 'crystal', emissive: 0x4aa8ff, glow: 1.3, hard: true };
const HEART: Surface = { color: 0xffffff, rough: 0.05, detail: 'crystal', emissive: 0xc08aff, glow: 2.6, hard: true };

const faceted = { amp: 0.018, freq: 6, mode: 'cracks' as const };

/** Bdolah, keeper of the crystals: a tall figure of dark cave-rock grown through with glowing amethyst. */
export async function buildGuardian(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 2.2,
    hip: 0.98,
    shoulder: 1.62,
    shoulderW: 0.32,
    hipW: 0.15,
    head: [0, 1.9, 0.08],
    headR: 0.13,
    chestZ: 0.04,
    arm: [0.42, 0.4, 0.22],
    armSpread: 0.4,
  });
  /** A crystal shard: a long faceted spindle with a sharp tip. */
  const shard = (base: V3, dir: V3, len: number, r: number, bone = b.chest, surf = CRYSTAL): void => {
    const d = v3.norm(dir);
    const tip = v3.add(base, v3.mul(d, len));
    s.limb(base, v3.add(base, v3.mul(d, len * 0.7)), r, r * 0.9, { bone, surf, blend: 0.006 });
    s.limb(v3.add(base, v3.mul(d, len * 0.7)), tip, r * 0.9, 0.002, { bone, surf, blend: 0.004 });
  };
  /** A cluster of shards fanning out from one point. */
  const cluster = (base: V3, dir: V3, len: number, r: number, bone = b.chest, n = 4): void => {
    const d = v3.norm(dir);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const spread: V3 = [Math.cos(a) * 0.45, Math.sin(a) * 0.45, Math.sin(a + 1) * 0.45];
      shard(base, v3.add(d, i === 0 ? [0, 0, 0] : spread), len * (i === 0 ? 1 : 0.6), r * (i === 0 ? 1 : 0.7), bone, i % 2 ? CRYSTAL_BLUE : CRYSTAL);
    }
  };
  // Body: angular slabs of cave rock, like a cliff that learned to stand.
  s.box([0, 1.44, 0.04], [0.28, 0.22, 0.17], 0.06, { bone: b.chest, surf: ROCK, blend: 0.04, relief: faceted, ry: 0.12 });
  s.box([0.08, 1.5, 0.1], [0.16, 0.14, 0.12], 0.04, { bone: b.chest, surf: ROCK_LIGHT, blend: 0.03, relief: faceted, ry: -0.3, rx: 0.2 });
  s.box([0, 1.15, 0.02], [0.17, 0.16, 0.13], 0.05, { bone: b.spine, surf: ROCK, blend: 0.04, relief: faceted, ry: -0.2 });
  s.box([0, 0.96, 0.0], [0.22, 0.12, 0.15], 0.05, { bone: b.hips, surf: ROCK_LIGHT, blend: 0.04, relief: faceted, ry: 0.15 });
  // Glowing heart crystal set in the chest, ringed by shards.
  s.carveSphere([0, 1.44, 0.24], 0.08, 0.02);
  s.ellipsoid([0, 1.44, 0.2], [0.05, 0.075, 0.05], { bone: b.chest, surf: HEART, blend: 0.004 });
  // Crown of shards on the head; a narrow, mask-like face.
  const h = b.spec.head;
  s.ellipsoid(h, [0.1, 0.14, 0.12], { bone: b.head, surf: ROCK, blend: 0.03, relief: faceted });
  s.ellipsoid(v3.add(h, [0, -0.08, 0.06]), [0.07, 0.07, 0.08], { bone: b.jaw, surf: ROCK_LIGHT, blend: 0.03 });
  s.box(v3.add(h, [0, 0.04, 0.1]), [0.09, 0.025, 0.04], 0.012, { bone: b.head, surf: ROCK_LIGHT, blend: 0.02, rx: -0.3 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.6;
    shard(v3.add(h, [Math.sin(a) * 0.07, 0.1, -0.02 - Math.abs(a) * 0.02]), [Math.sin(a) * 0.6, 1, -0.35], 0.22 + (i === 2 ? 0.14 : 0), 0.03, b.head, i % 2 ? CRYSTAL_BLUE : CRYSTAL);
  }
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(h, [x * 0.045, 0.0, 0.085]) as V3, r: 0.018, bone: b.head }));
  for (const e of eyes) s.carveSphere(v3.add(e.pos, [0, 0, 0.015]), 0.026, 0.008);
  // Shards bursting from shoulders and back.
  for (const [side, x] of SIDES) {
    const a = b.arms[side];
    s.ellipsoid(v3.add(a.shoulder, [x * 0.04, 0.03, 0]), [0.15, 0.13, 0.15], { bone: a.up, surf: ROCK, blend: 0.03, relief: faceted });
    cluster(v3.add(a.shoulder, [x * 0.06, 0.1, -0.03]), [x * 0.5, 1, -0.25], 0.48, 0.06, a.up, 5);
    // Arms of rock with crystal growths along the forearm.
    s.limb(a.shoulder, a.elbow, 0.09, 0.075, { bone: a.up, surf: ROCK, blend: 0.03, relief: faceted });
    s.limb(a.elbow, a.wrist, 0.08, 0.06, { bone: a.fore, surf: ROCK, blend: 0.03, relief: faceted });
    cluster(v3.mix(a.elbow, a.wrist, 0.4), [x * 0.7, 0.3, -0.6], 0.24, 0.035, a.fore, 3);
    // Hands: three long crystal-tipped fingers.
    const palm = v3.mix(a.wrist, a.tip, 0.3);
    s.ellipsoid(palm, [0.05, 0.06, 0.04], { bone: a.hand, surf: ROCK, blend: 0.02 });
    for (let i = 0; i < 3; i++) {
      const fx = (i - 1) * 0.03 * x;
      const p0: V3 = v3.add(palm, [fx, -0.05, 0.02]);
      const p1: V3 = v3.add(a.tip, [fx * 1.4, -0.02, 0.04]);
      s.limb(p0, p1, 0.016, 0.012, { bone: a.hand, surf: ROCK_LIGHT, blend: 0.008 });
      shard(p1, v3.sub(p1, p0), 0.05, 0.011, a.hand, CRYSTAL);
    }
    // Legs: tapering rock columns ending in crystal-studded feet.
    const l = b.legs[side];
    s.limb(l.hip, l.knee, 0.11, 0.085, { bone: l.thigh, surf: ROCK, blend: 0.04, relief: faceted });
    s.limb(l.knee, l.ankle, 0.085, 0.065, { bone: l.shin, surf: ROCK, blend: 0.03, relief: faceted });
    s.ellipsoid([l.ankle[0], 0.06, l.ankle[2] + 0.08], [0.08, 0.06, 0.15], { bone: l.foot, surf: ROCK_LIGHT, blend: 0.03, relief: faceted });
    shard([l.knee[0] + x * 0.04, l.knee[1], l.knee[2] + 0.05], [x * 0.4, 0.6, 1], 0.1, 0.02, l.shin, CRYSTAL_BLUE);
  }
  cluster([0.1, 1.55, -0.14], [0.3, 0.9, -1], 0.5, 0.065, b.chest, 5);
  cluster([-0.12, 1.3, -0.14], [-0.4, 0.5, -1], 0.36, 0.05, b.spine, 4);
  cluster([0.12, 0.98, 0.12], [0.6, 0.2, 0.8], 0.16, 0.03, b.hips, 3);
  return finish(
    s,
    { ctx, eyes, iris: 0xd0a0ff, eyeGlow: 2.4, irisScale: 2.2, material: { sheen: 0 } },
    {
      height: 2.2,
      gait: 'biped',
      pointWith: 'armR',
      posture: { chest: [0.04, 0, 0] },
      flying: false,
      hoverHeight: 0,
      magic: 0xc08aff,
      radius: 0.55,
      walkSpeed: 0.6,
    },
  );
}
