/**
 * The single source of truth for "what is the game doing right now".
 * Every screen and every gameplay mode is a phase; transitions are explicit and validated.
 */
export const PHASES = [
  'BOOT',
  'MENU',
  'RESUME_PROMPT',
  'AGE_SELECTION',
  'PLAYER_SETUP',
  'TUTORIAL',
  'LOADING',
  'INTRO_CINEMATIC',
  'PLAYING',
  'CREATURE_ENCOUNTER',
  'QUESTION_ACTIVE',
  'QUESTION_RESULT',
  'ROUTE_HINT',
  'SPECIAL_ENCOUNTER',
  'PAUSED',
  'LIFE_LOST',
  'CHECKPOINT',
  'VICTORY',
  'GAME_OVER',
  'SCORE_SUMMARY',
  'LEADERBOARD',
  'SETTINGS',
  'HOW_TO_PLAY',
] as const;

export type Phase = (typeof PHASES)[number];

/** Phases in which the player can walk. */
export const MOVEMENT_PHASES: ReadonlySet<Phase> = new Set<Phase>(['PLAYING', 'ROUTE_HINT']);

/** Phases in which the labyrinth clock runs. */
export const CLOCK_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'PLAYING',
  'ROUTE_HINT',
  'CREATURE_ENCOUNTER',
  'QUESTION_ACTIVE',
  'QUESTION_RESULT',
  'SPECIAL_ENCOUNTER',
]);

/** Phases that belong to an active run (the 3D labyrinth is live). */
export const IN_RUN_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'INTRO_CINEMATIC',
  'PLAYING',
  'CREATURE_ENCOUNTER',
  'QUESTION_ACTIVE',
  'QUESTION_RESULT',
  'ROUTE_HINT',
  'SPECIAL_ENCOUNTER',
  'PAUSED',
  'LIFE_LOST',
  'CHECKPOINT',
  'VICTORY',
]);

const PAUSABLE: Phase[] = ['PLAYING', 'ROUTE_HINT', 'CREATURE_ENCOUNTER', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'SPECIAL_ENCOUNTER'];

export const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  BOOT: ['MENU', 'RESUME_PROMPT'],
  MENU: ['AGE_SELECTION', 'LEADERBOARD', 'SETTINGS', 'HOW_TO_PLAY', 'RESUME_PROMPT'],
  RESUME_PROMPT: ['LOADING', 'MENU'],
  AGE_SELECTION: ['PLAYER_SETUP', 'MENU'],
  PLAYER_SETUP: ['TUTORIAL', 'LOADING', 'AGE_SELECTION'],
  TUTORIAL: ['LOADING', 'PLAYER_SETUP', 'MENU', 'PAUSED'],
  LOADING: ['INTRO_CINEMATIC', 'PLAYING', 'MENU'],
  INTRO_CINEMATIC: ['PLAYING', 'PAUSED'],
  PLAYING: ['CREATURE_ENCOUNTER', 'SPECIAL_ENCOUNTER', 'PAUSED', 'LIFE_LOST', 'GAME_OVER', 'VICTORY', 'ROUTE_HINT'],
  CREATURE_ENCOUNTER: ['QUESTION_ACTIVE', 'PAUSED', 'LIFE_LOST', 'GAME_OVER'],
  QUESTION_ACTIVE: ['QUESTION_RESULT', 'PAUSED', 'LIFE_LOST', 'GAME_OVER'],
  QUESTION_RESULT: ['ROUTE_HINT', 'PLAYING', 'PAUSED', 'LIFE_LOST', 'GAME_OVER'],
  ROUTE_HINT: ['PLAYING', 'CREATURE_ENCOUNTER', 'SPECIAL_ENCOUNTER', 'PAUSED', 'LIFE_LOST', 'GAME_OVER', 'VICTORY'],
  SPECIAL_ENCOUNTER: ['PLAYING', 'PAUSED', 'LIFE_LOST', 'GAME_OVER'],
  PAUSED: [...PAUSABLE, 'INTRO_CINEMATIC', 'SETTINGS', 'HOW_TO_PLAY', 'MENU'],
  LIFE_LOST: ['CHECKPOINT', 'GAME_OVER'],
  CHECKPOINT: ['PLAYING'],
  VICTORY: ['SCORE_SUMMARY'],
  GAME_OVER: ['SCORE_SUMMARY', 'LEADERBOARD', 'MENU', 'LOADING'],
  SCORE_SUMMARY: ['LEADERBOARD', 'MENU', 'LOADING', 'AGE_SELECTION'],
  LEADERBOARD: ['MENU', 'SCORE_SUMMARY', 'GAME_OVER'],
  SETTINGS: ['MENU', 'PAUSED'],
  HOW_TO_PLAY: ['MENU', 'PAUSED'],
};

export class GameMachine {
  private current: Phase = 'BOOT';
  /** Where overlay screens (settings, leaderboard, pause) return to. */
  private stack: Phase[] = [];
  private readonly listeners = new Set<(to: Phase, from: Phase) => void>();

  get phase(): Phase {
    return this.current;
  }

  get returnPhase(): Phase | undefined {
    return this.stack[this.stack.length - 1];
  }

  can(to: Phase): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: Phase, opts: { push?: boolean } = {}): boolean {
    if (to === this.current) return true;
    if (!this.can(to)) {
      if (import.meta.env?.DEV) console.warn(`[machine] illegal transition ${this.current} → ${to}`);
      return false;
    }
    const from = this.current;
    if (opts.push) this.stack.push(from);
    this.current = to;
    for (const l of this.listeners) l(to, from);
    return true;
  }

  /** Return from an overlay phase (pause, settings, leaderboard…) to where we came from. */
  back(fallback: Phase): boolean {
    const target = this.stack.pop() ?? fallback;
    if (this.can(target)) return this.transition(target);
    return this.transition(fallback);
  }

  clearStack(): void {
    this.stack = [];
  }

  /** Hard reset (used when abandoning a run). */
  reset(to: Phase): void {
    const from = this.current;
    this.current = to;
    this.stack = [];
    for (const l of this.listeners) l(to, from);
  }

  subscribe(fn: (to: Phase, from: Phase) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
