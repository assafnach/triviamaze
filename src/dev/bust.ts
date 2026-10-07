import type { BuildContext, SkinnedRig } from '@/game/creatures/rig';
import { biped, face, finish, neck, torso, type Surface } from '@/game/creatures/sculpt/anatomy';
import { Sculpt } from '@/game/creatures/sculpt/Sculpt';

/** Development-only: a bare head and shoulders for tuning the shared face builder. */
export async function buildBust(ctx: BuildContext): Promise<SkinnedRig> {
  const SKIN: Surface = { color: 0xc49a80, rough: 0.55, detail: 'skin' };
  const s = new Sculpt();
  const b = biped(s, { height: 1.74, hip: 0.9, shoulder: 1.43, shoulderW: 0.19, hipW: 0.09, head: [0, 1.6, 0.06], headR: 0.118, arm: [0.29, 0.26, 0.17] });
  torso(b, { surf: SKIN, chest: [0.18, 0.17, 0.13], belly: [0.17, 0.15, 0.14], pelvis: [0.17, 0.12, 0.13] });
  neck(b, SKIN, 0.055);
  const f = face(b, { skin: SKIN, nose: 'human', ears: 'human', lips: { color: 0x9a6458, rough: 0.5, detail: 'skin' } });
  return finish(
    s,
    { ctx, eyes: f.eyes.map((e) => ({ ...e, bone: b.head })), iris: 0x5f86b4, irisScale: 1.3, headDetail: { center: [0, 1.62, 0.08], half: [0.15, 0.15, 0.17] } },
    { height: 1.74, gait: 'biped', pointWith: 'armR', flying: false, hoverHeight: 0, magic: 0xffffff, radius: 0.4, walkSpeed: 0 },
  );
}
