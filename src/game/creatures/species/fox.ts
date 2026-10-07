import * as THREE from 'three';
import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, finish, quadLegs, quadruped, tail, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const FUR: Surface = { color: 0xc4602a, rough: 0.8, detail: 'fur' };
const FUR_DARK: Surface = { color: 0x8a3c1a, rough: 0.85, detail: 'fur' };
const WHITE: Surface = { color: 0xf0e6d8, rough: 0.85, detail: 'fur' };
const SOCK: Surface = { color: 0x2a1c16, rough: 0.85, detail: 'fur' };
const NOSE: Surface = { color: 0x141010, rough: 0.3, detail: 'skin', hard: true };
const EAR_INNER: Surface = { color: 0xe8d0c0, rough: 0.8, detail: 'fur' };
const SPIRIT: Surface = { color: 0xc8f0ff, rough: 0.6, detail: 'ghost', emissive: 0x6ad0ff, glow: 1.3 };

/** Armon, the enchanted fox: lithe and bright-eyed, with a brush tail whose tip burns with blue spirit-fire. */
export async function buildFox(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const q = quadruped(s, {
    shoulder: 0.42,
    hip: 0.43,
    frontZ: 0.2,
    backZ: -0.24,
    legW: 0.075,
    head: [0, 0.58, 0.37],
    headR: 0.1,
    neckBase: [0, 0.49, 0.25],
    tail: [
      [0, 0.44, -0.32],
      [0, 0.4, -0.5],
      [0.04, 0.36, -0.68],
      [0.1, 0.38, -0.84],
      [0.14, 0.46, -0.96],
    ],
  });
  const earL = s.bone('earL', [0.05, 0.72, 0.38], q.head);
  const earR = s.bone('earR', [-0.05, 0.72, 0.38], q.head);
  // Lean body with a deep, white chest ruff.
  s.ellipsoid([0, 0.46, 0.13], [0.13, 0.15, 0.17], { bone: q.chest, surf: FUR, blend: 0.07, relief: { amp: 0.005, freq: 30, mode: 'lumps' } });
  s.ellipsoid([0, 0.45, -0.06], [0.12, 0.13, 0.21], { bone: q.spine, surf: FUR, blend: 0.07 });
  s.ellipsoid([0, 0.46, -0.24], [0.125, 0.14, 0.14], { bone: q.hips, surf: FUR, blend: 0.07 });
  s.ellipsoid([0, 0.43, 0.26], [0.085, 0.12, 0.08], { bone: q.chest, surf: WHITE, blend: 0.05, relief: { amp: 0.006, freq: 30, mode: 'lumps' } });
  s.paintEllipsoid([0, 0.36, 0.0], [0.08, 0.06, 0.25], WHITE, 0.04);
  s.chain([[0, 0.48, 0.24], [0, 0.53, 0.3], [0, 0.56, 0.34]], [0.085, 0.075, 0.065], { bone: q.neck, surf: FUR, blend: 0.05 });
  // Head: rounded skull, tapering muzzle, cheek ruffs, big ears.
  const h = q.spec.head;
  s.ellipsoid(h, [0.085, 0.075, 0.085], { bone: q.head, surf: FUR, blend: 0.03 });
  s.limb(v3.add(h, [0, -0.015, 0.04]), v3.add(h, [0, -0.035, 0.17]), 0.05, 0.022, { bone: q.head, surf: FUR, blend: 0.03 });
  s.sphere(v3.add(h, [0, -0.03, 0.182]), 0.016, { bone: q.head, surf: NOSE, blend: 0.006 });
  s.limb(v3.add(h, [0, -0.06, 0.03]), v3.add(h, [0, -0.055, 0.14]), 0.03, 0.015, { bone: q.jaw, surf: WHITE, blend: 0.02 });
  s.paintLimb(v3.add(h, [0, -0.04, 0.05]), v3.add(h, [0, -0.045, 0.16]), 0.035, 0.02, WHITE, 0.015);
  s.carveLimb(v3.add(h, [0, -0.045, 0.06]), v3.add(h, [0, -0.046, 0.17]), 0.004, 0.004, 0.004);
  for (const [, x] of SIDES) {
    s.ellipsoid(v3.add(h, [x * 0.06, -0.04, 0.0]), [0.045, 0.035, 0.04], { bone: q.head, surf: WHITE, blend: 0.025, relief: { amp: 0.004, freq: 40, mode: 'lumps' } });
    const eb = x > 0 ? earL : earR;
    const base: V3 = v3.add(h, [x * 0.045, 0.05, -0.01]);
    s.blade(v3.add(base, [x * 0.025, 0.035, 0]), [x * 0.45, 1, -0.1], [0, 0, 1], 0.052, 0.038, 0.012, { bone: eb, surf: FUR_DARK, blend: 0.012 });
    s.carveBlade(v3.add(base, [x * 0.025, 0.035, 0.01]), [x * 0.45, 1, -0.1], [0, 0, 1], 0.04, 0.026, 0.006, 0.004);
    s.paintSphere(v3.add(base, [x * 0.02, 0.04, 0.012]), 0.04, EAR_INNER, 0.015);
  }
  quadLegs(q, { surf: FUR, paw: SOCK, r: [0.055, 0.032, 0.03], toes: 4 });
  for (const [side] of SIDES) {
    s.paintLimb(q.front[side].elbow, q.front[side].paw, 0.04, 0.04, SOCK, 0.03);
    s.paintLimb(q.back[side].hock, q.back[side].paw, 0.04, 0.04, SOCK, 0.03);
  }
  // A full brush tail with a white tip that burns with spirit-fire.
  tail(q, q.spec.tail, [0.06, 0.09, 0.1, 0.08, 0.05], FUR, { amp: 0.01, freq: 22, mode: 'lumps' });
  s.sphere([0.15, 0.49, -0.99], 0.05, { bone: q.tail[4]!, surf: WHITE, blend: 0.03 });
  s.paintSphere([0.14, 0.47, -0.97], 0.08, SPIRIT, 0.03);
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(h, [x * 0.04, 0.012, 0.062]) as V3, r: 0.016, bone: q.head }));
  for (const e of eyes) {
    s.sphere(e.pos, 0.018, { bone: q.head, surf: FUR_DARK, blend: 0.004 });
    s.carveEllipsoid(v3.add(e.pos, [0, 0.002, 0.014]), [0.016, 0.009, 0.01], 0.003);
  }
  // Spirit wisp floating over the tail tip (animated in `extra`).
  const wispMat = new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), wispMat);
  const rig = await finish(
    s,
    {
      ctx,
      eyes,
      iris: 0xd8a020,
      pupil: 'slit',
      irisScale: 1.6,
      material: { sheen: 0.6, sheenColor: 0xffc890 },
      headDetail: { center: v3.add(h, [0, 0.03, 0.06]), half: [0.12, 0.13, 0.16], scale: 0.65 },
    },
    {
      height: 0.75,
      gait: 'quadruped',
      pointWith: 'head',
      posture: { neck: [-0.15, 0, 0], head: [0.2, 0, 0] },
      flying: false,
      hoverHeight: 0,
      magic: 0x9fe4ff,
      radius: 0.38,
      walkSpeed: 0.9,
    },
  );
  q.tail[4]!.add(wisp);
  wisp.position.set(0.0, 0.08, -0.02);
  rig.disposables.push(wisp.geometry, wispMat);
  rig.extra = (t, _dt, mood) => {
    wisp.scale.setScalar(0.8 + Math.sin(t * 6) * 0.15 + mood * 0.25);
    wispMat.opacity = 0.45 + Math.sin(t * 9) * 0.15;
  };
  return rig;
}
