import * as THREE from 'three';
import { createCreatureMaterial } from '../../render/detailShader';
import type { BuildContext, SkinnedRig } from '../rig';
import { voxelFor } from '../rig';
import { SIDES, finish, v3, type Surface } from '../sculpt/anatomy';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

interface BirdLook {
  /** Body length scale (1 = owl-sized, ~0.5 m tall). */
  size: number;
  feather: Surface;
  featherDark: Surface;
  breast: Surface;
  beak: Surface;
  talon: Surface;
  iris: number;
  /** Owl: big round head and facial disc; raven: sleek head and heavy beak. */
  kind: 'owl' | 'raven';
  magic: number;
  perchTop: number;
}

const BARK: Surface = { color: 0x4e3c2c, rough: 0.9, detail: 'bark' };
const BARK_DARK: Surface = { color: 0x30261c, rough: 0.92, detail: 'bark' };
const LICHEN: Surface = { color: 0x8a9a6a, rough: 0.95, detail: 'moss' };

/** A gnarled dead-branch perch standing on the floor, `top` metres high. */
async function buildPerch(ctx: BuildContext, top: number): Promise<{ group: THREE.Group; disposables: { dispose(): void }[] }> {
  const s = new Sculpt();
  const grain = { amp: 0.006, freq: 24, mode: 'grooves' as const };
  s.chain(
    [
      [0, 0, 0],
      [0.03, top * 0.35, 0.01],
      [-0.02, top * 0.7, -0.01],
      [0, top - 0.04, 0],
    ],
    [0.09, 0.06, 0.05, 0.045],
    { surf: BARK, blend: 0.02, relief: grain },
  );
  // Crossbar the bird grips, a stub branch and spreading roots.
  s.limb([-0.16, top - 0.03, 0.02], [0.18, top - 0.02, -0.01], 0.03, 0.026, { surf: BARK_DARK, blend: 0.02, relief: grain });
  s.limb([0.02, top * 0.55, 0], [0.18, top * 0.75, 0.06], 0.025, 0.008, { surf: BARK, blend: 0.015 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    s.limb([0, 0.06, 0], [Math.cos(a) * 0.22, 0.0, Math.sin(a) * 0.22], 0.05, 0.015, { surf: BARK_DARK, blend: 0.03 });
  }
  s.paintSphere([0.04, top * 0.4, 0.05], 0.08, LICHEN, 0.03);
  const mat = createCreatureMaterial({ physical: false });
  const built = await s.buildAsync(mat, voxelFor(top, ctx) * 0.9, undefined, ctx.job);
  const group = new THREE.Group();
  group.add(built.mesh);
  return { group, disposables: [built.mesh.geometry, mat] };
}

async function buildBird(ctx: BuildContext, o: BirdLook): Promise<SkinnedRig> {
  const k = o.size;
  const s = new Sculpt();
  const owl = o.kind === 'owl';
  const hips = s.bone('hips', [0, 0.16 * k, -0.02 * k]);
  const spine = s.bone('spine', [0, 0.24 * k, 0], hips);
  const chest = s.bone('chest', [0, 0.3 * k, 0.02 * k], spine);
  const neck = s.bone('neck', [0, 0.36 * k, 0.02 * k], chest);
  const headC: V3 = owl ? [0, 0.44 * k, 0.03 * k] : [0, 0.42 * k, 0.08 * k];
  const head = s.bone('head', v3.add(headC, [0, -0.05 * k, -0.02 * k]), neck);
  const jaw = s.bone('jaw', v3.add(headC, [0, -0.01 * k, 0.08 * k]), head);
  const wing = { L: s.bone('wingL', [0.11 * k, 0.32 * k, 0], chest), R: s.bone('wingR', [-0.11 * k, 0.32 * k, 0], chest) };
  const tailB = s.bone('tail0', [0, 0.12 * k, -0.1 * k], hips);
  const legs = SIDES.map(([side, x]) => s.bone(`thigh${side}`, [x * 0.045 * k, 0.1 * k, 0.02 * k], hips));
  const soft = { amp: 0.004 * k, freq: 30 / k, mode: 'lumps' as const };
  // Body.
  s.ellipsoid([0, 0.22 * k, 0], [0.13 * k, 0.17 * k, 0.12 * k], { bone: spine, surf: o.feather, blend: 0.04 * k, relief: soft });
  s.ellipsoid([0, 0.22 * k, 0.05 * k], [0.1 * k, 0.14 * k, 0.08 * k], { bone: chest, surf: o.breast, blend: 0.03 * k, relief: soft });
  // Head.
  if (owl) {
    s.ellipsoid(headC, [0.12 * k, 0.1 * k, 0.1 * k], { bone: head, surf: o.feather, blend: 0.05 * k, relief: soft });
    // Facial disc: a shallow bowl around each eye.
    for (const [, x] of SIDES) {
      s.carveSphere(v3.add(headC, [x * 0.045 * k, 0.005 * k, 0.12 * k]), 0.05 * k, 0.012 * k);
      s.paintSphere(v3.add(headC, [x * 0.045 * k, 0.0, 0.09 * k]), 0.06 * k, o.breast, 0.02 * k);
      // Ear tufts.
      s.blade(v3.add(headC, [x * 0.075 * k, 0.09 * k, 0.0]), [x * 0.4, 1, -0.1], [0, 0, 1], 0.045 * k, 0.018 * k, 0.008 * k, { bone: head, surf: o.featherDark, blend: 0.01 * k });
    }
    s.limb(v3.add(headC, [0, 0.02 * k, 0.085 * k]), v3.add(headC, [0, -0.03 * k, 0.11 * k]), 0.014 * k, 0.004 * k, { bone: head, surf: o.beak, blend: 0.006 * k });
  } else {
    s.ellipsoid(headC, [0.06 * k, 0.065 * k, 0.075 * k], { bone: head, surf: o.feather, blend: 0.03 * k, relief: soft });
    s.limb([0, 0.32 * k, 0.04 * k], headC, 0.07 * k, 0.05 * k, { bone: neck, surf: o.feather, blend: 0.03 * k });
    // Heavy, slightly hooked beak; the lower half on the jaw.
    s.limb(v3.add(headC, [0, 0.01 * k, 0.05 * k]), v3.add(headC, [0, -0.005 * k, 0.15 * k]), 0.022 * k, 0.004 * k, { bone: head, surf: o.beak, blend: 0.008 * k });
    s.limb(v3.add(headC, [0, -0.018 * k, 0.05 * k]), v3.add(headC, [0, -0.02 * k, 0.13 * k]), 0.015 * k, 0.003 * k, { bone: jaw, surf: o.beak, blend: 0.006 * k });
    // Throat hackles.
    s.ellipsoid([0, 0.33 * k, 0.07 * k], [0.05 * k, 0.05 * k, 0.04 * k], { bone: chest, surf: o.featherDark, blend: 0.02 * k, relief: { amp: 0.004 * k, freq: 40 / k, mode: 'ridges' } });
  }
  // Folded wings along the flanks, layered primaries.
  for (const [side, x] of SIDES) {
    const wb = wing[side];
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      s.blade([x * (0.11 + t * 0.012) * k, (0.27 - t * 0.06) * k, (-0.01 - t * 0.07) * k], [0, -0.55 - t * 0.2, -1], [x, 0.3, 0], (0.13 + t * 0.03) * k, 0.06 * k, 0.012 * k, {
        bone: wb,
        surf: i === 3 ? o.featherDark : o.feather,
        blend: 0.008 * k,
      });
    }
  }
  // Tail feathers.
  s.blade([0, 0.1 * k, -0.15 * k], [0, -0.6, -1], [1, 0, 0], (owl ? 0.09 : 0.16) * k, 0.05 * k, 0.01 * k, { bone: tailB, surf: o.featherDark, blend: 0.01 * k });
  // Legs and talons gripping the crossbar.
  for (const [i, [, x]] of SIDES.entries()) {
    const lb = legs[i] as THREE.Bone;
    s.limb([x * 0.045 * k, 0.1 * k, 0.03 * k], [x * 0.05 * k, 0.02 * k, 0.04 * k], 0.022 * k, 0.012 * k, { bone: lb, surf: owl ? o.breast : o.featherDark, blend: 0.01 * k });
    for (let t = 0; t < 3; t++) {
      const a = (t - 1) * 0.5;
      s.chain([[x * 0.05 * k, 0.015 * k, 0.04 * k], [x * (0.05 + Math.sin(a) * 0.03) * k, 0.01 * k, (0.04 + Math.cos(a) * 0.035) * k], [x * (0.05 + Math.sin(a) * 0.035) * k, -0.012 * k, (0.04 + Math.cos(a) * 0.045) * k]], [0.006 * k, 0.005 * k, 0.002 * k], {
        bone: lb,
        surf: o.talon,
        blend: 0.003 * k,
      });
    }
  }
  const eyeR = (owl ? 0.034 : 0.014) * k;
  const eyes = SIDES.map(([, x]) => ({ pos: v3.add(headC, owl ? [x * 0.045 * k, 0.005 * k, 0.07 * k] : [x * 0.045 * k, 0.015 * k, 0.04 * k]) as V3, r: eyeR, bone: head }));
  for (const e of eyes) {
    s.sphere(e.pos, eyeR * 1.08, { bone: head, surf: o.featherDark, blend: eyeR * 0.2 });
    s.carveEllipsoid(v3.add(e.pos, owl ? [0, 0, eyeR * 0.9] : [e.pos[0] > 0 ? eyeR * 0.7 : -eyeR * 0.7, 0, eyeR * 0.4]), [eyeR * 0.95, eyeR * 0.85, eyeR * 0.55], eyeR * 0.1);
  }
  const perch = await buildPerch(ctx, o.perchTop);
  const rig = await finish(
    s,
    { ctx, eyes, iris: o.iris, irisScale: owl ? 1.9 : 1.2, material: { sheen: owl ? 0.5 : 0.18, sheenColor: owl ? 0xe0c8a0 : 0x3a4a8a }, detail: 0.85 },
    {
      height: 0.5 * k,
      gait: 'bird',
      pointWith: 'wing',
      flying: true,
      hoverHeight: o.perchTop,
      magic: o.magic,
      radius: 0.3,
      walkSpeed: 0,
    },
  );
  rig.root.add(perch.group);
  rig.perch = perch.group;
  rig.disposables.push(...perch.disposables);
  return rig;
}

/** Humam, the wise owl: tawny and round, with tufted ears and enormous amber eyes, on a gnarled perch. */
export function buildOwl(ctx: BuildContext): Promise<SkinnedRig> {
  return buildBird(ctx, {
    size: 1.15,
    kind: 'owl',
    feather: { color: 0x8a6a46, rough: 0.8, detail: 'feather' },
    featherDark: { color: 0x5a4430, rough: 0.8, detail: 'feather' },
    breast: { color: 0xd8c4a0, rough: 0.8, detail: 'feather' },
    beak: { color: 0x3a3028, rough: 0.35, detail: 'horn', hard: true },
    talon: { color: 0x2a2420, rough: 0.4, detail: 'horn', hard: true },
    iris: 0xf0a020,
    magic: 0xffe08a,
    perchTop: 1.15,
  });
}

/** Karkor, the talking raven: glossy blue-black, sharp-eyed, heavy-beaked. */
export function buildRaven(ctx: BuildContext): Promise<SkinnedRig> {
  return buildBird(ctx, {
    size: 1.0,
    kind: 'raven',
    feather: { color: 0x141418, rough: 0.55, detail: 'feather' },
    featherDark: { color: 0x0b0b0e, rough: 0.6, detail: 'feather' },
    breast: { color: 0x18181e, rough: 0.6, detail: 'feather' },
    beak: { color: 0x1a1a1e, rough: 0.3, detail: 'horn', hard: true },
    talon: { color: 0x101012, rough: 0.4, detail: 'horn', hard: true },
    iris: 0x3a2a18,
    magic: 0xb8a8ff,
    perchTop: 1.25,
  });
}
