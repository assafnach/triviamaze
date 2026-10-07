import type { CreatureId, ThemeId } from '@/types';

export type WallPattern = 'bricks' | 'blocks' | 'rock' | 'hedge' | 'ice' | 'basalt';
export type FloorPattern = 'flagstone' | 'cobble' | 'moss' | 'rock' | 'ice' | 'tiles';
export type LightKind = 'torch' | 'crystal' | 'lantern' | 'brazier' | 'mushroom';
export type ParticleKind = 'dust' | 'fireflies' | 'embers' | 'snow' | 'spores' | 'motes' | 'leaves';
export type PropKind =
  | 'rubble'
  | 'vines'
  | 'mushrooms'
  | 'crystals'
  | 'roots'
  | 'icicles'
  | 'banners'
  | 'candles'
  | 'runes'
  | 'lavacracks'
  | 'flowers'
  | 'books';
export type AmbiencePreset = 'ruins' | 'cave' | 'forest' | 'temple' | 'lava' | 'ice' | 'mystic' | 'castle';

export interface ThemeDef {
  id: ThemeId;
  openSky: boolean;
  wallHeight: number;
  fogColor: number;
  fogDensity: number;
  skyTop: number;
  skyBottom: number;
  stars: boolean;
  moon: boolean;
  aurora: boolean;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  moonLight: number;
  moonIntensity: number;
  lanternColor: number;
  lanternIntensity: number;
  wall: { pattern: WallPattern; base: number; accent: number; mortar: number; roughness: number; scale: number };
  floor: { pattern: FloorPattern; base: number; accent: number; mortar: number; roughness: number; scale: number };
  ceiling?: { base: number; accent: number };
  trim: number;
  light: { kind: LightKind; color: number; intensity: number; every: number };
  runeColor: number;
  particles: ParticleKind;
  props: PropKind[];
  creatures: CreatureId[];
  ambience: AmbiencePreset;
  /** Semitone offsets of the musical mode used by the generative score. */
  musicMode: number[];
  musicRoot: number;
  reverb: number;
  exposure: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const THEMES: Record<ThemeId, ThemeDef> = {
  ruins: {
    id: 'ruins',
    openSky: true,
    wallHeight: 4.2,
    fogColor: 0x1b2333,
    fogDensity: 0.045,
    skyTop: 0x070b1a,
    skyBottom: 0x2a3550,
    stars: true,
    moon: true,
    aurora: false,
    hemiSky: 0x7d8fbf,
    hemiGround: 0x2b2418,
    hemiIntensity: 0.7,
    moonLight: 0x9fb4ff,
    moonIntensity: 0.55,
    lanternColor: 0xffc58a,
    lanternIntensity: 11,
    wall: { pattern: 'bricks', base: 0x9c8461, accent: 0x6f5a3e, mortar: 0x3a3024, roughness: 0.92, scale: 2.2 },
    floor: { pattern: 'flagstone', base: 0x6e6553, accent: 0x4c5a33, mortar: 0x2c3322, roughness: 0.95, scale: 3 },
    trim: 0xb49a72,
    light: { kind: 'torch', color: 0xff9a4a, intensity: 14, every: 5 },
    runeColor: 0x7fd6ff,
    particles: 'fireflies',
    props: ['rubble', 'vines', 'flowers', 'runes'],
    creatures: ['wizard', 'goblin', 'raven', 'sphinx', 'troll', 'owl', 'fox', 'golem'],
    ambience: 'ruins',
    musicMode: DORIAN,
    musicRoot: 50,
    reverb: 0.25,
    exposure: 1.05,
  },
  crystal: {
    id: 'crystal',
    openSky: false,
    wallHeight: 4.6,
    fogColor: 0x0d1430,
    fogDensity: 0.038,
    skyTop: 0x05060f,
    skyBottom: 0x0d1430,
    stars: false,
    moon: false,
    aurora: false,
    hemiSky: 0x5a6bd8,
    hemiGround: 0x2a2448,
    hemiIntensity: 1.35,
    moonLight: 0x000000,
    moonIntensity: 0,
    lanternColor: 0xd8e4ff,
    lanternIntensity: 14,
    wall: { pattern: 'rock', base: 0x5a5f8a, accent: 0x7466a8, mortar: 0x16162a, roughness: 0.75, scale: 3 },
    floor: { pattern: 'rock', base: 0x44476a, accent: 0x584c88, mortar: 0x121222, roughness: 0.6, scale: 3 },
    ceiling: { base: 0x22233a, accent: 0x34305a },
    trim: 0x6a73b8,
    light: { kind: 'crystal', color: 0x6fb8ff, intensity: 14, every: 3 },
    runeColor: 0xb18bff,
    particles: 'motes',
    props: ['crystals', 'rubble', 'mushrooms'],
    creatures: ['guardian', 'fairy', 'dragon', 'golem', 'mushroom', 'elf', 'owl', 'ghost'],
    ambience: 'cave',
    musicMode: LYDIAN,
    musicRoot: 52,
    reverb: 0.6,
    exposure: 1.2,
  },
  forest: {
    id: 'forest',
    openSky: true,
    wallHeight: 3.8,
    fogColor: 0x14261d,
    fogDensity: 0.05,
    skyTop: 0x050d12,
    skyBottom: 0x1a3a33,
    stars: true,
    moon: true,
    aurora: false,
    hemiSky: 0x88b8a0,
    hemiGround: 0x1d2a14,
    hemiIntensity: 0.75,
    moonLight: 0xb8d8ff,
    moonIntensity: 0.5,
    lanternColor: 0xffd9a0,
    lanternIntensity: 10,
    wall: { pattern: 'hedge', base: 0x2f5a2c, accent: 0x4e7d35, mortar: 0x10200f, roughness: 0.95, scale: 2.5 },
    floor: { pattern: 'moss', base: 0x3e4a26, accent: 0x5a4a30, mortar: 0x1c2412, roughness: 1, scale: 3 },
    trim: 0x5a4632,
    light: { kind: 'lantern', color: 0xffc070, intensity: 11, every: 5 },
    runeColor: 0x9dffb0,
    particles: 'fireflies',
    props: ['mushrooms', 'flowers', 'roots', 'vines'],
    creatures: ['spirit', 'fairy', 'fox', 'mushroom', 'owl', 'witch', 'elf', 'goblin'],
    ambience: 'forest',
    musicMode: DORIAN,
    musicRoot: 55,
    reverb: 0.2,
    exposure: 1.1,
  },
  temple: {
    id: 'temple',
    openSky: false,
    wallHeight: 5,
    fogColor: 0x221a10,
    fogDensity: 0.04,
    skyTop: 0x0a0805,
    skyBottom: 0x221a10,
    stars: false,
    moon: false,
    aurora: false,
    hemiSky: 0xd6b27a,
    hemiGround: 0x2a1c0e,
    hemiIntensity: 0.95,
    moonLight: 0x000000,
    moonIntensity: 0,
    lanternColor: 0xffcf8a,
    lanternIntensity: 12,
    wall: { pattern: 'blocks', base: 0xa8916a, accent: 0xc9a656, mortar: 0x463724, roughness: 0.82, scale: 2.5 },
    floor: { pattern: 'tiles', base: 0x5e4b33, accent: 0x8e6f3a, mortar: 0x2a2015, roughness: 0.6, scale: 2 },
    ceiling: { base: 0x3e3020, accent: 0x6a5230 },
    trim: 0xd4b066,
    light: { kind: 'brazier', color: 0xff8f3a, intensity: 15, every: 4 },
    runeColor: 0xffd27a,
    particles: 'dust',
    props: ['banners', 'candles', 'runes', 'rubble'],
    creatures: ['sphinx', 'wizard', 'ghost', 'golem', 'elf', 'raven', 'dragon', 'guardian'],
    ambience: 'temple',
    musicMode: PHRYGIAN,
    musicRoot: 50,
    reverb: 0.55,
    exposure: 1.1,
  },
  volcanic: {
    id: 'volcanic',
    openSky: false,
    wallHeight: 4.8,
    fogColor: 0x2a0f08,
    fogDensity: 0.04,
    skyTop: 0x0c0302,
    skyBottom: 0x2a0f08,
    stars: false,
    moon: false,
    aurora: false,
    hemiSky: 0xff7a3a,
    hemiGround: 0x2a1410,
    hemiIntensity: 0.95,
    moonLight: 0x000000,
    moonIntensity: 0,
    lanternColor: 0xffb070,
    lanternIntensity: 13,
    wall: { pattern: 'basalt', base: 0x4a403c, accent: 0x5e4436, mortar: 0x120c0a, roughness: 0.85, scale: 2.6 },
    floor: { pattern: 'rock', base: 0x40342e, accent: 0x553a2c, mortar: 0x0e0908, roughness: 0.9, scale: 3 },
    ceiling: { base: 0x1a1412, accent: 0x2c1e18 },
    trim: 0x6a3a22,
    light: { kind: 'brazier', color: 0xff5a1a, intensity: 13, every: 4 },
    runeColor: 0xff8a3a,
    particles: 'embers',
    props: ['lavacracks', 'rubble', 'crystals'],
    creatures: ['dragon', 'golem', 'troll', 'goblin', 'guardian', 'wizard', 'raven', 'witch'],
    ambience: 'lava',
    musicMode: HARMONIC_MINOR,
    musicRoot: 45,
    reverb: 0.45,
    exposure: 0.95,
  },
  frozen: {
    id: 'frozen',
    openSky: true,
    wallHeight: 4.4,
    fogColor: 0x1c2a3c,
    fogDensity: 0.05,
    skyTop: 0x040a18,
    skyBottom: 0x1f3550,
    stars: true,
    moon: false,
    aurora: true,
    hemiSky: 0xa8c8ff,
    hemiGround: 0x2a3446,
    hemiIntensity: 0.6,
    moonLight: 0xb0d0ff,
    moonIntensity: 0.35,
    lanternColor: 0xffe0b0,
    lanternIntensity: 8,
    wall: { pattern: 'ice', base: 0x7fa8cc, accent: 0xc4dcf0, mortar: 0x3e5a78, roughness: 0.4, scale: 3 },
    floor: { pattern: 'ice', base: 0x9cb4cc, accent: 0xd8e6f2, mortar: 0x5a7490, roughness: 0.5, scale: 3.5 },
    trim: 0xd8ecff,
    light: { kind: 'crystal', color: 0x8fd0ff, intensity: 8, every: 5 },
    runeColor: 0x9ff0ff,
    particles: 'snow',
    props: ['icicles', 'crystals', 'rubble'],
    creatures: ['owl', 'fox', 'guardian', 'golem', 'elf', 'wizard', 'spirit', 'ghost'],
    ambience: 'ice',
    musicMode: AEOLIAN,
    musicRoot: 57,
    reverb: 0.5,
    exposure: 0.85,
  },
  mystic: {
    id: 'mystic',
    openSky: false,
    wallHeight: 4.6,
    fogColor: 0x170d26,
    fogDensity: 0.05,
    skyTop: 0x06030c,
    skyBottom: 0x170d26,
    stars: false,
    moon: false,
    aurora: false,
    hemiSky: 0xa070ff,
    hemiGround: 0x140a20,
    hemiIntensity: 1.0,
    moonLight: 0x000000,
    moonIntensity: 0,
    lanternColor: 0xe8d0ff,
    lanternIntensity: 11,
    wall: { pattern: 'blocks', base: 0x6a5a88, accent: 0x8a70b8, mortar: 0x1e1830, roughness: 0.8, scale: 2.4 },
    floor: { pattern: 'flagstone', base: 0x4e4468, accent: 0x5a4a80, mortar: 0x100c18, roughness: 0.75, scale: 3 },
    ceiling: { base: 0x3a3250, accent: 0x4a3e6a },
    trim: 0x7a5ab8,
    light: { kind: 'mushroom', color: 0xc070ff, intensity: 14, every: 3 },
    runeColor: 0xd28bff,
    particles: 'spores',
    props: ['runes', 'mushrooms', 'books', 'candles'],
    creatures: ['ghost', 'witch', 'mushroom', 'spirit', 'wizard', 'fairy', 'elf', 'guardian'],
    ambience: 'mystic',
    musicMode: HARMONIC_MINOR,
    musicRoot: 48,
    reverb: 0.6,
    exposure: 1.15,
  },
  castle: {
    id: 'castle',
    openSky: true,
    wallHeight: 5,
    fogColor: 0x161c2c,
    fogDensity: 0.045,
    skyTop: 0x04060f,
    skyBottom: 0x222c46,
    stars: true,
    moon: true,
    aurora: false,
    hemiSky: 0x8da0d8,
    hemiGround: 0x22201c,
    hemiIntensity: 0.65,
    moonLight: 0xc0d0ff,
    moonIntensity: 0.85,
    lanternColor: 0xffc88a,
    lanternIntensity: 11,
    wall: { pattern: 'bricks', base: 0x8e909a, accent: 0x6c707c, mortar: 0x2e3036, roughness: 0.88, scale: 2 },
    floor: { pattern: 'cobble', base: 0x6e7078, accent: 0x55585f, mortar: 0x1c1d22, roughness: 0.85, scale: 2.5 },
    trim: 0x8a8ea0,
    light: { kind: 'torch', color: 0xff9440, intensity: 14, every: 5 },
    runeColor: 0x8fb8ff,
    particles: 'dust',
    props: ['banners', 'rubble', 'vines', 'candles'],
    creatures: ['wizard', 'ghost', 'raven', 'troll', 'witch', 'owl', 'dragon', 'goblin'],
    ambience: 'castle',
    musicMode: AEOLIAN,
    musicRoot: 50,
    reverb: 0.35,
    exposure: 1.05,
  },
};
