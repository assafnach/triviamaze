export const AGE_GROUPS = ['5-7', '8-10', '11-13', '14-15', '16+'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CATEGORIES = [
  'animals',
  'nature',
  'colors',
  'numbers',
  'math',
  'science',
  'space',
  'geography',
  'history',
  'language',
  'literature',
  'logic',
  'technology',
  'computers',
  'culture',
  'art',
  'music',
  'physics',
  'chemistry',
  'biology',
  'philosophy',
  'economics',
  'mythology',
  'fairytales',
  'everyday',
  'sport',
  'general',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const THEME_IDS = [
  'ruins',
  'crystal',
  'forest',
  'temple',
  'volcanic',
  'frozen',
  'mystic',
  'castle',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const CREATURE_IDS = [
  'wizard',
  'goblin',
  'fairy',
  'raven',
  'dragon',
  'spirit',
  'golem',
  'elf',
  'mushroom',
  'ghost',
  'guardian',
  'fox',
  'sphinx',
  'troll',
  'witch',
  'owl',
] as const;
export type CreatureId = (typeof CREATURE_IDS)[number];

/** Hebrew addresses the player in gendered second person. */
export type AddressForm = 'm' | 'f';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = 'auto' | QualityLevel;

export interface Question {
  id: string;
  ageGroup: AgeGroup;
  category: Category;
  difficulty: Difficulty;
  question: string;
  /** Exactly four answers. */
  answers: [string, string, string, string];
  /** Index into `answers`. */
  correctAnswer: number;
  explanation: string;
  tags?: string[];
  source?: string;
}

/** A question as shown to the player, with shuffled answers. */
export interface PresentedQuestion {
  question: Question;
  answers: string[];
  correctIndex: number;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualitySetting;
  mouseSensitivity: number;
  touchSensitivity: number;
  reducedMotion: boolean;
  showMinimap: boolean;
  address: AddressForm;
  tutorialSeen: boolean;
}

export interface RunSetup {
  ageGroup: AgeGroup;
  nickname: string;
  seed: number;
  mode: 'random' | 'daily';
}
