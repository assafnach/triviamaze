import type { AgeGroup, Difficulty, QualityLevel } from '@/types';

/**
 * Central, tunable game configuration. Everything that affects balance lives here
 * so designers can adjust it without touching game logic.
 */
export const GAME_CONFIG = {
  /** Each life gets this many seconds. 10 minutes × 3 lives = up to 30 minutes per run. */
  lifeDurationSec: 600,
  startingLives: 3,
  /** Timer urgency thresholds (seconds remaining). */
  tensionThresholdSec: 120,
  urgentThresholdSec: 30,
  /** Keep the clock running while a question is open — knowledge under pressure. */
  pauseTimerDuringQuestions: false,

  scoring: {
    basePerCorrect: 100,
    difficultyMultiplier: { easy: 1, medium: 1.25, hard: 1.5, expert: 2 } satisfies Record<Difficulty, number>,
    wrongAnswerPenalty: 25,
    /** Victory only: points per second left on the clock of the current life. */
    timeBonusPerSecond: 1,
    /** Victory only: points per life still in hand. */
    livesBonusPerLife: 150,
    lifeLossPenalty: 100,
    treasureValue: 25,
    /** Treasures can never outweigh trivia skill. */
    treasureCap: 250,
    /** Victory only: scaled by optimal path / walked path. */
    efficiencyBonusMax: 300,
    /** Sanity ceiling used by client and server validation. */
    absoluteMaxScore: 20000,
  },

  world: {
    cellSize: 4,
    wallThickness: 0.7,
  },

  player: {
    eyeHeight: 1.62,
    radius: 0.32,
    walkSpeed: 3.3,
    sprintSpeed: 5.0,
    acceleration: 14,
    /** Used for validation: the fastest a player can possibly move (m/s). */
    maxPossibleSpeed: 5.2,
  },

  encounter: {
    noticeDistance: 12,
    triggerDistance: 2.9,
    /** The creature's revealed route stays visible this long (seconds) or until the player moves away. */
    hintDurationSec: 75,
    hintClearDistanceCells: 3,
  },

  events: {
    /** Seconds between ambient cinematic events (min, max). */
    intervalSec: [55, 110] as [number, number],
  },

  treasures: { pickupDistance: 1.3 },
} as const;

export interface MazeProfile {
  size: [number, number];
  encounters: number;
  /** Probability of continuing from the newest cell in the growing-tree algorithm (higher = longer corridors). */
  corridorBias: number;
  /** Fraction of dead-ends opened into loops (creates alternative routes). */
  braid: number;
  rooms: number;
  treasures: number;
  /** Relative difficulty distribution for questions in this age group. */
  difficultyWeights: Record<Difficulty, number>;
}

export const MAZE_PROFILES: Record<AgeGroup, MazeProfile> = {
  '5-7': {
    size: [8, 9],
    encounters: 4,
    corridorBias: 0.7,
    braid: 0.05,
    rooms: 1,
    treasures: 6,
    difficultyWeights: { easy: 5, medium: 3, hard: 1, expert: 0 },
  },
  '8-10': {
    size: [10, 11],
    encounters: 5,
    corridorBias: 0.68,
    braid: 0.07,
    rooms: 2,
    treasures: 7,
    difficultyWeights: { easy: 3, medium: 4, hard: 2, expert: 0.5 },
  },
  '11-13': {
    size: [12, 14],
    encounters: 6,
    corridorBias: 0.66,
    braid: 0.08,
    rooms: 2,
    treasures: 8,
    difficultyWeights: { easy: 2, medium: 4, hard: 3, expert: 1 },
  },
  '14-15': {
    size: [14, 16],
    encounters: 7,
    corridorBias: 0.6,
    braid: 0.1,
    rooms: 3,
    treasures: 8,
    difficultyWeights: { easy: 1, medium: 3, hard: 4, expert: 2 },
  },
  '16+': {
    size: [16, 19],
    encounters: 8,
    corridorBias: 0.6,
    braid: 0.12,
    rooms: 3,
    treasures: 9,
    difficultyWeights: { easy: 0.5, medium: 2, hard: 4, expert: 3 },
  },
};

export interface QualityProfile {
  pixelRatioCap: number;
  bloom: boolean;
  shadows: boolean;
  maxTorchLights: number;
  particleScale: number;
  propDensity: number;
  textureSize: number;
  antialias: boolean;
  /** Multisampling for the post-processing buffer (used when bloom is on). */
  msaaSamples: number;
  /** SMAA post-process antialiasing (used when bloom is on). */
  smaa: boolean;
  drawDistance: number;
  /** Resolution of the moonlight shadow map. */
  shadowMapSize: number;
  /** Screen-space ground-truth ambient occlusion (contact shadows under props and creatures). */
  ao: boolean;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    pixelRatioCap: 1,
    bloom: false,
    shadows: false,
    maxTorchLights: 2,
    particleScale: 0.35,
    propDensity: 0.45,
    textureSize: 256,
    antialias: true,
    msaaSamples: 0,
    smaa: false,
    drawDistance: 26,
    shadowMapSize: 1024,
    ao: false,
  },
  medium: {
    pixelRatioCap: 1.5,
    bloom: true,
    shadows: false,
    maxTorchLights: 4,
    particleScale: 0.7,
    propDensity: 0.75,
    textureSize: 1024,
    antialias: true,
    msaaSamples: 0,
    smaa: true,
    drawDistance: 34,
    shadowMapSize: 1024,
    ao: false,
  },
  high: {
    pixelRatioCap: 2,
    bloom: true,
    shadows: true,
    maxTorchLights: 6,
    particleScale: 1,
    propDensity: 1,
    textureSize: 1024,
    antialias: true,
    msaaSamples: 4,
    smaa: false,
    drawDistance: 44,
    shadowMapSize: 2048,
    ao: false,
  },
  ultra: {
    pixelRatioCap: 2.5,
    bloom: true,
    shadows: true,
    maxTorchLights: 8,
    particleScale: 1.3,
    propDensity: 1.2,
    textureSize: 2048,
    antialias: true,
    msaaSamples: 4,
    smaa: false,
    drawDistance: 56,
    shadowMapSize: 4096,
    ao: true,
  },
};

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  quality: 'auto',
  mouseSensitivity: 1,
  touchSensitivity: 1,
  reducedMotion: false,
  showMinimap: true,
  address: 'm',
  tutorialSeen: false,
} as const;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
