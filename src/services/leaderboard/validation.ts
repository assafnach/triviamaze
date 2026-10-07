import { GAME_CONFIG } from '@/config/gameConfig';
import { calculateScore, maxPossibleScore } from '@/game/scoring/score';
import { AGE_GROUPS, DIFFICULTIES, THEME_IDS } from '@/types';
import { validateNickname } from '../nickname';
import type { RunSubmission } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isInt = (n: unknown, min: number, max: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const isNum = (n: unknown, min: number, max: number): boolean => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

/**
 * Plausibility checks for a completed run. The same rules are enforced server-side
 * (see supabase/migrations). This deters casual tampering; it is not perfect cheat-proofing.
 */
export function validateSubmission(sub: RunSubmission): { ok: true } | { ok: false; reason: string } {
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
  if (!sub || typeof sub !== 'object') return fail('malformed');
  if (!UUID.test(sub.runId) || !UUID.test(sub.playerId)) return fail('bad ids');
  if (!AGE_GROUPS.includes(sub.ageGroup)) return fail('bad age group');
  if (!THEME_IDS.includes(sub.theme)) return fail('bad theme');
  const nick = validateNickname(sub.nickname);
  if (!nick.ok || nick.value !== sub.nickname) return fail('bad nickname');
  if (!isInt(sub.seed, 0, 0xffffffff)) return fail('bad seed');
  if (!Array.isArray(sub.answers) || sub.answers.length > 16) return fail('bad answers');
  for (const a of sub.answers) {
    if (!a || !DIFFICULTIES.includes(a.difficulty) || typeof a.correct !== 'boolean') return fail('bad answer');
  }
  if (!isInt(sub.encounterCount, 1, 16) || sub.answers.length > sub.encounterCount) return fail('impossible question count');
  if (!isInt(sub.treasureCount, 0, 20) || !isInt(sub.treasures, 0, sub.treasureCount)) return fail('impossible treasures');
  // A leaderboard run is a completed (escaped) run: at most 2 lives lost.
  if (!isInt(sub.livesLost, 0, GAME_CONFIG.startingLives - 1)) return fail('impossible lives');
  if (sub.livesRemaining !== GAME_CONFIG.startingLives - sub.livesLost) return fail('inconsistent lives');
  if (!isNum(sub.timeLeftSec, 0, GAME_CONFIG.lifeDurationSec)) return fail('impossible time left');
  const maxTotal = GAME_CONFIG.lifeDurationSec * GAME_CONFIG.startingLives + 120;
  if (!isNum(sub.completionTimeSec, 1, maxTotal)) return fail('impossible completion time');
  if (!isInt(sub.optimalPathCells, 2, 400) || !isInt(sub.walkedCells, sub.optimalPathCells - 1, 100000)) return fail('impossible route');
  const minTime = ((sub.optimalPathCells - 1) * GAME_CONFIG.world.cellSize) / GAME_CONFIG.player.maxPossibleSpeed;
  if (sub.completionTimeSec < minTime * 0.9) return fail('impossibly fast');
  if (!isNum(sub.specialPoints, -500, 0)) return fail('bad special points');
  const wall = (sub.completedAt - sub.startedAt) / 1000;
  if (!isNum(sub.startedAt, 1.6e12, 4e12) || !(wall >= sub.completionTimeSec * 0.8)) return fail('clock mismatch');
  const recomputed = calculateScore({
    answers: sub.answers.map((a, i) => ({ questionId: String(i), difficulty: a.difficulty, correct: a.correct, encounterCell: i })),
    treasures: sub.treasures,
    livesLost: sub.livesLost,
    livesRemaining: sub.livesRemaining,
    timeLeftSec: sub.timeLeftSec,
    victory: true,
    optimalPathCells: sub.optimalPathCells,
    walkedCells: sub.walkedCells,
    specialPoints: sub.specialPoints,
  });
  if (recomputed.total !== sub.score) return fail('score mismatch');
  if (sub.score > maxPossibleScore(sub.encounterCount, sub.treasureCount)) return fail('impossible score');
  return { ok: true };
}
