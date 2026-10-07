import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/gameConfig';
import { generateMaze } from '@/game/maze/generator';
import { cellCenter, isOpen, neighbor, worldToCell } from '@/game/maze/grid';
import { DIRS, DX, DY } from '@/game/maze/types';
import { CollisionWorld } from '@/game/player/collision';
import { calculateScore } from '@/game/scoring/score';
import type { RunSubmission } from '@/services/leaderboard/types';
import { validateSubmission } from '@/services/leaderboard/validation';
import { isProfane, sanitizeNickname, validateNickname } from '@/services/nickname';

function legitSubmission(): RunSubmission {
  const maze = generateMaze(12345, '11-13');
  const answers = [
    { difficulty: 'medium' as const, correct: true },
    { difficulty: 'hard' as const, correct: false },
    { difficulty: 'hard' as const, correct: true },
  ];
  const optimal = maze.solution.length - 1;
  const walked = optimal * 2;
  const base = {
    answers: answers.map((a, i) => ({ ...a, questionId: String(i), encounterCell: i })),
    treasures: 2,
    livesLost: 1,
    livesRemaining: 2,
    timeLeftSec: 312.5,
    victory: true,
    optimalPathCells: optimal,
    walkedCells: walked,
    specialPoints: 0,
  };
  const score = calculateScore(base).total;
  const startedAt = 1_760_000_000_000;
  return {
    runId: '11111111-2222-4333-8444-555555555555',
    playerId: '66666666-7777-4888-9999-aaaaaaaaaaaa',
    nickname: 'אביר הלילה',
    ageGroup: '11-13',
    seed: 12345,
    theme: 'castle',
    startedAt,
    completedAt: startedAt + 900_000,
    completionTimeSec: 887.5,
    score,
    answers,
    livesLost: 1,
    livesRemaining: 2,
    timeLeftSec: 312.5,
    treasures: 2,
    specialPoints: 0,
    optimalPathCells: optimal,
    walkedCells: walked,
    encounterCount: maze.encounters.length,
    treasureCount: maze.treasures.length,
  };
}

describe('leaderboard submission validation', () => {
  it('accepts a legitimate completed run', () => {
    expect(validateSubmission(legitSubmission())).toEqual({ ok: true });
  });

  const tamper: [string, (s: RunSubmission) => void][] = [
    ['inflated score', (s) => (s.score += 500)],
    ['impossible question count', (s) => (s.answers = Array.from({ length: s.encounterCount + 1 }, () => ({ difficulty: 'expert', correct: true })))],
    ['impossibly fast completion', (s) => (s.completionTimeSec = 3)],
    ['walked less than the shortest route', (s) => (s.walkedCells = 2)],
    ['all lives lost yet "completed"', (s) => ((s.livesLost = 3), (s.livesRemaining = 0))],
    ['inconsistent lives', (s) => (s.livesRemaining = 3)],
    ['more time left than a life has', (s) => (s.timeLeftSec = 9999)],
    ['bad age group', (s) => ((s as { ageGroup: string }).ageGroup = '99+')],
    ['bad nickname', (s) => (s.nickname = 'x')],
    ['profane nickname', (s) => (s.nickname = 'fuck')],
    ['malformed run id', (s) => (s.runId = 'not-a-uuid')],
    ['wall clock shorter than play time', (s) => (s.completedAt = s.startedAt + 10_000)],
    ['positive special points', (s) => (s.specialPoints = 500)],
    ['more treasures than exist', (s) => (s.treasures = s.treasureCount + 1)],
  ];
  for (const [name, mutate] of tamper) {
    it(`rejects: ${name}`, () => {
      const s = legitSubmission();
      mutate(s);
      expect(validateSubmission(s).ok).toBe(false);
    });
  }
});

describe('nicknames', () => {
  it('accepts Hebrew, English, digits and spaces within 2–16 characters', () => {
    expect(validateNickname('אביר הלילה')).toEqual({ ok: true, value: 'אביר הלילה' });
    expect(validateNickname('Dragon_7')).toEqual({ ok: true, value: 'Dragon_7' });
    expect(validateNickname('  נועה   כהן ')).toEqual({ ok: true, value: 'נועה כהן' });
  });

  it('enforces length', () => {
    expect(validateNickname('א')).toEqual({ ok: false, error: 'tooShort' });
    expect(validateNickname('א'.repeat(17))).toEqual({ ok: false, error: 'tooLong' });
  });

  it('rejects markup and odd symbols', () => {
    expect(validateNickname('<script>')).toEqual({ ok: false, error: 'invalid' });
    expect(validateNickname('a;drop table')).toEqual({ ok: false, error: 'invalid' });
  });

  it('strips bidi overrides, zero-width characters and niqqud', () => {
    const rlo = String.fromCharCode(0x202e);
    const zw = String.fromCharCode(0x200b);
    expect(sanitizeNickname(`${rlo}abc${zw}d`)).toBe('abcd');
    expect(sanitizeNickname('שָׁלוֹם')).toBe('שלום');
  });

  it('blocks obvious profanity in Hebrew and English, including disguises', () => {
    for (const bad of ['זונה', 'בן זונה', 'f.u.c.k', 'sh1t', 'HITLER', 'נאצי']) expect(isProfane(bad), bad).toBe(true);
    for (const ok of ['אריה אמיץ', 'Sasha', 'Classic', 'מגדלור', 'Scholar']) expect(isProfane(ok), ok).toBe(false);
  });
});

describe('collision', () => {
  const C = GAME_CONFIG.world.cellSize;
  const R = GAME_CONFIG.player.radius;

  it('never lets the player walk through a closed wall, and lets them through open passages', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const maze = generateMaze(seed, '14-15');
      const world = new CollisionWorld(maze);
      for (let c = 0; c < maze.width * maze.height; c += 3) {
        for (const d of DIRS) {
          const start = cellCenter(maze, c);
          // Try to walk 3 m straight in direction d, in small steps (as the controller does).
          let x = start.x;
          let z = start.z;
          for (let i = 0; i < 30; i++) {
            const r = world.move(x, z, DX[d] * 0.1, DY[d] * 0.1, R);
            x = r.x;
            z = r.z;
          }
          const end = worldToCell(maze, x, z);
          if (isOpen(maze, c, d)) expect(end).toBe(neighbor(maze, c, d));
          else expect(end).toBe(c);
        }
      }
    }
  });

  it('keeps the player inside the labyrinth bounds even at high speed', () => {
    const maze = generateMaze(9, '8-10');
    const world = new CollisionWorld(maze);
    const p = world.move(C / 2, C / 2, -50, -50, R);
    expect(p.x).toBeGreaterThan(0);
    expect(p.z).toBeGreaterThan(0);
  });
});
