import { GAME_CONFIG } from '@/config/gameConfig';
import type { Difficulty } from '@/types';

export interface AnswerRecord {
  questionId: string;
  difficulty: Difficulty;
  correct: boolean;
  encounterCell: number;
}

export interface ScoreInput {
  answers: readonly AnswerRecord[];
  treasures: number;
  livesLost: number;
  livesRemaining: number;
  /** Seconds left on the clock of the current life when the run ended. */
  timeLeftSec: number;
  victory: boolean;
  /** Length (in cells) of the shortest entrance→exit route. */
  optimalPathCells: number;
  /** Number of cell-to-cell moves the player actually made. */
  walkedCells: number;
  /** Net points from special encounters (e.g. the oracle's price). */
  specialPoints: number;
}

export interface ScoreBreakdown {
  trivia: number;
  timeBonus: number;
  livesBonus: number;
  treasures: number;
  efficiency: number;
  /** Always ≤ 0. */
  penalties: number;
  total: number;
  correct: number;
  wrong: number;
}

const S = GAME_CONFIG.scoring;

export function triviaPoints(difficulty: Difficulty): number {
  return Math.round(S.basePerCorrect * S.difficultyMultiplier[difficulty]);
}

/** Route efficiency in [0, 1]: 1 means the player walked the optimal route. */
export function routeEfficiency(optimal: number, walked: number): number {
  if (optimal <= 0 || walked <= 0) return 0;
  return Math.min(1, optimal / walked);
}

/**
 * Final score. Victory-only bonuses (time, lives, efficiency) reward actually escaping;
 * a game over still keeps the knowledge and treasure the player earned.
 */
export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const correctAnswers = input.answers.filter((a) => a.correct);
  const wrong = input.answers.length - correctAnswers.length;
  const trivia = correctAnswers.reduce((sum, a) => sum + triviaPoints(a.difficulty), 0);
  const treasures = Math.min(S.treasureCap, Math.max(0, input.treasures) * S.treasureValue);
  const timeBonus = input.victory ? Math.round(Math.max(0, input.timeLeftSec) * S.timeBonusPerSecond) : 0;
  const livesBonus = input.victory ? Math.max(0, input.livesRemaining) * S.livesBonusPerLife : 0;
  const eff = routeEfficiency(input.optimalPathCells, input.walkedCells);
  const efficiency = input.victory ? Math.round(S.efficiencyBonusMax * eff * eff) : 0;
  const special = Math.round(input.specialPoints);
  const penalties =
    -(wrong * S.wrongAnswerPenalty) - Math.max(0, input.livesLost) * S.lifeLossPenalty + Math.min(0, special);
  const raw = trivia + timeBonus + livesBonus + treasures + efficiency + Math.max(0, special) + penalties;
  const total = Math.max(0, Math.min(S.absoluteMaxScore, Math.round(raw)));
  return {
    trivia: trivia + Math.max(0, special),
    timeBonus,
    livesBonus,
    treasures,
    efficiency,
    penalties,
    total,
    correct: correctAnswers.length,
    wrong,
  };
}

/** Upper bound on any legitimate score for a run with `questionCount` encounters (used by validation). */
export function maxPossibleScore(questionCount: number, treasureCount: number): number {
  return (
    questionCount * triviaPoints('expert') +
    GAME_CONFIG.lifeDurationSec * S.timeBonusPerSecond +
    GAME_CONFIG.startingLives * S.livesBonusPerLife +
    Math.min(S.treasureCap, treasureCount * S.treasureValue) +
    S.efficiencyBonusMax +
    200
  );
}
