import type { ThemeId } from '@/types';

/**
 * Physically-based look of each biome: which photoscanned material sets dress walls, trims
 * (arches, pillars, cornices), floors and ceilings, how they are graded, and what settles on them.
 * Scales are in metres per texture tile.
 */
export interface LayerDef {
  tex: string;
  tint: number;
  metres: number;
  normalScale?: number;
  roughness?: number;
  moss?: { color: number; amount: number };
  wet?: number;
}

export interface BiomeLook {
  wall: LayerDef;
  trim: LayerDef;
  floor: LayerDef;
  ceiling: LayerDef;
  /** Environment reflections strength (PBR specular from the sky/cave probe). */
  envIntensity: number;
  grime: number;
  /** Wall surface undulation (m): dressed masonry is flat, cave rock bulges. */
  relief: number;
  /** Fraction of wall segments with crumbled tops. */
  crumble: number;
  /** How far cave ceilings sag between walls (m). */
  ceilingRelief: number;
}

export const BIOME_LOOK: Record<ThemeId, BiomeLook> = {
  ruins: {
    wall: { tex: 'castle_wall_varriation', tint: 0xd8cbb4, metres: 2.4, normalScale: 1.4, moss: { color: 0x4d5f26, amount: 0.55 } },
    trim: { tex: 'old_sandstone_02', tint: 0xb5aa98, metres: 2.2, normalScale: 1.2, moss: { color: 0x4d5f26, amount: 0.4 } },
    floor: { tex: 'monastery_stone_floor', tint: 0xb3aa9c, metres: 2.6, normalScale: 1.3, moss: { color: 0x47581f, amount: 0.6 }, wet: 0.55 },
    ceiling: { tex: 'rock_wall_02', tint: 0x8a8378, metres: 3 },
    envIntensity: 0.55,
    grime: 0.4,
    relief: 0.045,
    crumble: 0.45,
    ceilingRelief: 0,
  },
  forest: {
    wall: { tex: 'mossy_stone_wall', tint: 0xc4c8b0, metres: 2.2, normalScale: 1.5, moss: { color: 0x3f5a1c, amount: 0.95 } },
    trim: { tex: 'mossy_rock', tint: 0xb8bca4, metres: 2.4, normalScale: 1.3, moss: { color: 0x41601c, amount: 0.8 } },
    floor: { tex: 'forest_leaves_02', tint: 0xb4ae98, metres: 2.4, normalScale: 1.2, moss: { color: 0x3e5a1a, amount: 0.35 }, wet: 0.2 },
    ceiling: { tex: 'bark_willow', tint: 0x6a5a48, metres: 3 },
    envIntensity: 0.45,
    grime: 0.45,
    relief: 0.06,
    crumble: 0.35,
    ceilingRelief: 0,
  },
  crystal: {
    wall: { tex: 'rock_wall_02', tint: 0xd4dcf4, metres: 3, normalScale: 1.6, moss: { color: 0x5aa8b8, amount: 0.25 } },
    trim: { tex: 'dark_rock_02', tint: 0xd0d6f0, metres: 2.6, normalScale: 1.4 },
    floor: { tex: 'river_small_rocks', tint: 0xc0c8de, metres: 2.4, normalScale: 1.4, wet: 0.8 },
    ceiling: { tex: 'rock_wall_02', tint: 0xa8b0cc, metres: 3.4, normalScale: 1.6 },
    envIntensity: 0.8,
    grime: 0.3,
    relief: 0.13,
    crumble: 0,
    ceilingRelief: 0.6,
  },
  temple: {
    wall: { tex: 'sandstone_blocks_08', tint: 0xd9c4a0, metres: 2.6, normalScale: 1.3, moss: { color: 0x9a8058, amount: 0.25 } },
    trim: { tex: 'old_sandstone_02', tint: 0xe0c89e, metres: 2, normalScale: 1.1 },
    floor: { tex: 'stone_tiles_02', tint: 0xc8b090, metres: 2.6, normalScale: 1.1, roughness: 0.8, wet: 0 },
    ceiling: { tex: 'old_sandstone_02', tint: 0x9a8668, metres: 3 },
    envIntensity: 0.7,
    grime: 0.35,
    relief: 0.02,
    crumble: 0.05,
    ceilingRelief: 0,
  },
  volcanic: {
    wall: { tex: 'dark_rock', tint: 0xe0ccc0, metres: 2.8, normalScale: 1.8, moss: { color: 0x5a5552, amount: 0.45 } },
    trim: { tex: 'dark_rock_02', tint: 0xb8a69c, metres: 2.6, normalScale: 1.5 },
    floor: { tex: 'burned_ground_01', tint: 0xa09088, metres: 2.4, normalScale: 1.4, moss: { color: 0x3c3836, amount: 0.3 } },
    ceiling: { tex: 'dark_rock', tint: 0x7a706a, metres: 3.2 },
    envIntensity: 0.45,
    grime: 0.5,
    relief: 0.12,
    crumble: 0,
    ceilingRelief: 0.5,
  },
  frozen: {
    wall: { tex: 'rock_wall_02', tint: 0xb4c4d8, metres: 3, normalScale: 1.5, moss: { color: 0xe8f2ff, amount: 0.85 } },
    trim: { tex: 'dark_rock_02', tint: 0xb0bcd0, metres: 2.6, normalScale: 1.3, moss: { color: 0xeef5ff, amount: 0.75 } },
    floor: { tex: 'river_small_rocks', tint: 0xb8c4d4, metres: 2.4, moss: { color: 0xf0f6ff, amount: 0.9 }, wet: 0.35 },
    ceiling: { tex: 'rock_wall_02', tint: 0x9aa8bc, metres: 3 },
    envIntensity: 0.8,
    grime: 0.15,
    relief: 0.11,
    crumble: 0.1,
    ceilingRelief: 0,
  },
  mystic: {
    wall: { tex: 'castle_wall_varriation', tint: 0xa898c4, metres: 2.4, normalScale: 1.4, moss: { color: 0x5a3f7a, amount: 0.35 } },
    trim: { tex: 'old_sandstone_02', tint: 0x9e90b8, metres: 2, normalScale: 1.2 },
    floor: { tex: 'stone_tiles_02', tint: 0x8c80a8, metres: 2.6, normalScale: 1.2, wet: 0.4 },
    ceiling: { tex: 'rock_wall_02', tint: 0x6a5e80, metres: 3 },
    envIntensity: 0.7,
    grime: 0.35,
    relief: 0.035,
    crumble: 0.1,
    ceilingRelief: 0,
  },
  castle: {
    wall: { tex: 'castle_wall_varriation', tint: 0xc4c4c8, metres: 2.2, normalScale: 1.4, moss: { color: 0x4d5a2c, amount: 0.3 } },
    trim: { tex: 'rustic_stone_wall', tint: 0xa8a6a4, metres: 2.2, normalScale: 1.2 },
    floor: { tex: 'mossy_cobblestone', tint: 0xb0b0b0, metres: 2.2, normalScale: 1.3, moss: { color: 0x4a5a26, amount: 0.3 }, wet: 0.5 },
    ceiling: { tex: 'rock_wall_02', tint: 0x88888c, metres: 3 },
    envIntensity: 0.55,
    grime: 0.4,
    relief: 0.03,
    crumble: 0.12,
    ceilingRelief: 0,
  },
};

/** Biomes a run can travel into (same sky type, so the architecture flows continuously). */
export const BIOME_NEIGHBOURS: Record<ThemeId, ThemeId[]> = {
  ruins: ['forest', 'castle'],
  forest: ['ruins', 'frozen'],
  castle: ['ruins', 'frozen'],
  frozen: ['forest', 'castle'],
  crystal: ['volcanic', 'temple', 'mystic'],
  volcanic: ['crystal', 'temple'],
  temple: ['crystal', 'volcanic', 'mystic'],
  mystic: ['crystal', 'temple'],
};

/**
 * Per-cell weight of a run's second biome: the crossover happens a little past the halfway
 * point of the true route, blending over about a quarter of it.
 */
export function biomeWeights(distFromStart: Int32Array, exit: number): Float32Array {
  const n = distFromStart.length;
  const w = new Float32Array(n);
  const total = Math.max(1, distFromStart[exit] as number);
  for (let c = 0; c < n; c++) {
    const k = Math.min(1, Math.max(0, ((distFromStart[c] as number) / total - 0.4) / 0.24));
    w[c] = k * k * (3 - 2 * k);
  }
  return w;
}

/** Every material set a pair of biomes needs. */
export function biomeTextures(...ids: ThemeId[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const l = BIOME_LOOK[id];
    for (const layer of [l.wall, l.trim, l.floor, l.ceiling]) out.add(layer.tex);
  }
  return [...out];
}
