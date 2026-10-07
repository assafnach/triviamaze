import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, face, finish, quadLegs, quadruped, tail, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const PELT: Surface = { color: 0xc89a58, rough: 0.75, detail: 'fur' };
const PELT_DARK: Surface = { color: 0x9a7038, rough: 0.8, detail: 'fur' };
const SKIN: Surface = { color: 0xb88458, rough: 0.5, detail: 'skin' };
const LIPS: Surface = { color: 0x8a4a3a, rough: 0.45, detail: 'skin' };
const KOHL: Surface = { color: 0x1a1210, rough: 0.5, detail: 'skin' };
const GOLD: Surface = { color: 0xd4a43c, rough: 0.3, detail: 'metal', hard: true };
const LAPIS: Surface = { color: 0x2a4a9a, rough: 0.35, detail: 'metal', hard: true };
const FEATHER: Surface = { color: 0xb08a50, rough: 0.7, detail: 'feather', hard: true };
const FEATHER_TIP: Surface = { color: 0x5a3a20, rough: 0.7, detail: 'feather', hard: true };
const CLAW: Surface = { color: 0x2a2018, rough: 0.4, detail: 'horn', hard: true };

/** The Sphinx, keeper of riddles: a lioness with folded wings and a woman's face under a striped headdress. */
export async function buildSphinx(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const q = quadruped(s, {
    shoulder: 0.82,
    hip: 0.78,
    frontZ: 0.42,
    backZ: -0.5,
    legW: 0.19,
    head: [0, 1.32, 0.76],
    headR: 0.17,
    neckBase: [0, 1.0, 0.56],
    tail: [
      [0, 0.82, -0.66],
      [0, 0.66, -0.86],
      [0, 0.42, -0.98],
      [0.08, 0.22, -1.04],
    ],
  });
  const wing = { L: s.bone('wingL', [0.18, 1.0, 0.2], q.chest), R: s.bone('wingR', [-0.18, 1.0, 0.2], q.chest) };
  // Lioness body.
  s.ellipsoid([0, 0.88, 0.36], [0.3, 0.33, 0.32], { bone: q.chest, surf: PELT, blend: 0.1 });
  s.ellipsoid([0, 0.84, -0.06], [0.27, 0.27, 0.38], { bone: q.spine, surf: PELT, blend: 0.1 });
  s.ellipsoid([0, 0.84, -0.46], [0.28, 0.29, 0.28], { bone: q.hips, surf: PELT, blend: 0.1 });
  s.paintEllipsoid([0, 0.66, 0.05], [0.18, 0.1, 0.4], { color: 0xe0c08a, rough: 0.75, detail: 'fur' }, 0.06);
  // Human neck and shoulders rising from the lion's chest, with a broad gold collar.
  s.limb([0, 0.98, 0.52], [0, 1.16, 0.68], 0.13, 0.075, { bone: q.neck, surf: SKIN, blend: 0.08 });
  // Broad collar of gold and lapis bands over the chest.
  s.ellipsoid([0, 1.02, 0.56], [0.24, 0.05, 0.2], { bone: q.chest, surf: LAPIS, blend: 0.015 });
  s.ellipsoid([0, 1.0, 0.58], [0.25, 0.03, 0.21], { bone: q.chest, surf: GOLD, blend: 0.01 });
  const f = face(q, {
    skin: SKIN,
    brow: 0.3,
    nose: 'human',
    noseLen: 0.3,
    lips: LIPS,
    mouthW: 0.3,
    ears: 'none',
    eyeR: 0.0165,
    lids: 0.45,
    chin: 0.85,
  });
  // Kohl-lined eyes.
  for (const e of f.eyes) s.paintEllipsoid(v3.add(e.pos, [0, 0, 0.012]), [0.032, 0.02, 0.02], KOHL, 0.006);
  // Nemes headdress: a striped cloth over the crown with lappets falling over the shoulders.
  const h = q.spec.head;
  const R = q.spec.headR;
  // Set high and back so it frames the brow without covering the eyes.
  s.ellipsoid(v3.add(h, [0, R * 0.4, -R * 0.25]), [R * 1.08, R * 0.88, R * 1.05], { bone: q.head, surf: GOLD, blend: R * 0.08 });
  s.box(v3.add(h, [0, R * 0.78, R * 0.6]), [R * 0.95, R * 0.06, R * 0.18], R * 0.04, { bone: q.head, surf: GOLD, blend: R * 0.05 });
  for (const [, x] of SIDES) {
    s.limb(v3.add(h, [x * R * 1.05, R * 0.05, -R * 0.1]), v3.add(h, [x * R * 1.2, -R * 1.6, R * 0.2]), R * 0.3, R * 0.22, { bone: q.head, surf: GOLD, blend: R * 0.12 });
  }
  // Lapis stripes on the lappets and the back of the cloth (kept clear of the face).
  for (const [, x] of SIDES) {
    for (let i = 0; i < 5; i++) {
      s.paintEllipsoid(v3.add(h, [x * R * 1.12, -R * (0.15 + i * 0.32), R * (0.0 + i * 0.05)]), [R * 0.36, R * 0.06, R * 0.36], LAPIS, R * 0.02);
    }
  }
  for (let i = 0; i < 4; i++) s.paintEllipsoid(v3.add(h, [0, R * (1.0 - i * 0.3), -R * 0.95]), [R * 1.1, R * 0.06, R * 0.5], LAPIS, R * 0.02);
  s.sphere(v3.add(h, [0, R * 0.88, R * 0.82]), R * 0.09, { bone: q.head, surf: LAPIS, blend: R * 0.03 });
  quadLegs(q, { surf: PELT, paw: PELT, claw: CLAW, r: [0.14, 0.09, 0.09], toes: 4 });
  tail(q, q.spec.tail, [0.06, 0.045, 0.035, 0.03], PELT);
  s.ellipsoid([0.1, 0.18, -1.06], [0.05, 0.08, 0.05], { bone: q.tail[3]!, surf: PELT_DARK, blend: 0.02, relief: { amp: 0.006, freq: 30, mode: 'lumps' } });
  // Folded feathered wings along the flanks.
  for (const [side, x] of SIDES) {
    const wb = wing[side];
    const root: V3 = [x * 0.2, 1.02, 0.24];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const c: V3 = [x * (0.24 + t * 0.03), 1.12 + t * 0.06, 0.16 - t * 0.55];
      s.blade(c, [0, 0.12 - t * 0.1, -1], [x, 0.9, 0], 0.24 - t * 0.03, 0.1, 0.018, { bone: wb, surf: i > 3 ? FEATHER_TIP : FEATHER, blend: 0.012 });
    }
    s.limb(root, [x * 0.25, 1.14, 0.06], 0.055, 0.045, { bone: wb, surf: FEATHER, blend: 0.03 });
  }
  return finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: q.head })),
      iris: 0x8a5a20,
      irisScale: 1.35,
      eyeGlow: 0.2,
      material: { sheen: 0.4, sheenColor: 0xffd8a0 },
      headDetail: { center: v3.add(h, [0, 0, R * 0.2]), half: [R * 1.5, R * 1.4, R * 1.4], scale: 0.55 },
    },
    {
      height: 1.68,
      gait: 'quadruped',
      pointWith: 'head',
      posture: { neck: [-0.05, 0, 0] },
      flying: false,
      hoverHeight: 0,
      magic: 0xffd27a,
      radius: 0.62,
      walkSpeed: 0.6,
    },
  );
}
