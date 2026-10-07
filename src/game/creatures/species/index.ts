import type { CreatureId } from '@/types';
import type { BuildContext, SkinnedRig } from '../rig';
import { buildOwl, buildRaven } from './birds';
import { buildDragon } from './dragon';
import { buildElf } from './elf';
import { buildFairy } from './fairy';
import { buildFox } from './fox';
import { buildGhost } from './ghost';
import { buildGoblin } from './goblin';
import { buildGolem } from './golem';
import { buildGuardian } from './guardian';
import { buildMushroom } from './mushroom';
import { buildMerchant, buildOracle } from './specials';
import { buildSphinx } from './sphinx';
import { buildSpirit } from './spirit';
import { buildTroll } from './troll';
import { buildWitch } from './witch';
import { buildWizard } from './wizard';

export type SpeciesBuilder = (ctx: BuildContext) => Promise<SkinnedRig>;

/** Every quiz creature, sculpted. */
export const SPECIES: Record<CreatureId, SpeciesBuilder> = {
  goblin: buildGoblin,
  wizard: buildWizard,
  elf: buildElf,
  witch: buildWitch,
  troll: buildTroll,
  dragon: buildDragon,
  fox: buildFox,
  sphinx: buildSphinx,
  golem: buildGolem,
  guardian: buildGuardian,
  spirit: buildSpirit,
  owl: buildOwl,
  raven: buildRaven,
  mushroom: buildMushroom,
  ghost: buildGhost,
  fairy: buildFairy,
};

/** The two special characters (not quiz-givers): the Oracle and the Time Merchant. */
export const SPECIAL_SPECIES: Record<'oracle' | 'merchant', SpeciesBuilder> = {
  oracle: buildOracle,
  merchant: buildMerchant,
};

export function buildSpecies(name: string, ctx: BuildContext): Promise<SkinnedRig> {
  const b = SPECIES[name as CreatureId] ?? SPECIAL_SPECIES[name as 'oracle' | 'merchant'];
  if (!b) throw new Error(`Unknown species ${name}`);
  return b(ctx);
}
