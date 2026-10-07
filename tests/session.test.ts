import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/gameConfig';
import { calculateScore, maxPossibleScore, routeEfficiency, triviaPoints, type ScoreInput } from '@/game/scoring/score';
import { RunSession } from '@/game/session/RunSession';
import { CLOCK_PHASES, GameMachine, MOVEMENT_PHASES } from '@/state/machine';

const baseInput: ScoreInput = {
  answers: [],
  treasures: 0,
  livesLost: 0,
  livesRemaining: 3,
  timeLeftSec: 0,
  victory: false,
  optimalPathCells: 40,
  walkedCells: 80,
  specialPoints: 0,
};

describe('timer and lives', () => {
  it('starts with 10:00 and 3 lives', () => {
    const s = new RunSession(0, 0);
    expect(s.timeLeft).toBe(600);
    expect(s.lives).toBe(3);
  });

  it('removes exactly one life when the clock hits zero, then resets to 10:00', () => {
    const s = new RunSession(5, 1.2);
    s.reachCheckpoint(17, 0.5);
    s.enterCell(18);
    const events = s.tick(600, true);
    expect(events).toContain('lifeLost');
    expect(s.lives).toBe(2);
    expect(s.livesLost).toBe(1);
    expect(s.timeLeft).toBe(GAME_CONFIG.lifeDurationSec);
    expect(s.currentCell).toBe(17); // back to the latest checkpoint
  });

  it('ends the run after the third expiry — up to 30 minutes in total', () => {
    const s = new RunSession(0, 0);
    expect(s.tick(600, true)).toContain('lifeLost');
    expect(s.tick(600, true)).toContain('lifeLost');
    const last = s.tick(600, true);
    expect(last).toContain('gameOver');
    expect(s.lives).toBe(0);
    expect(s.elapsed).toBe(1800);
    expect(s.tick(10, true)).toEqual([]);
  });

  it('fires tension and urgency once per life', () => {
    const s = new RunSession(0, 0);
    expect(s.tick(600 - 119, true)).toEqual(['tension']);
    expect(s.tick(1, true)).toEqual([]);
    expect(s.tick(90, true)).toEqual(['urgent']);
    expect(s.tick(29, true)).toEqual(['lifeLost']);
    expect(s.tick(481, true)).toEqual(['tension']);
  });

  it('does not run the clock when paused', () => {
    const s = new RunSession(0, 0);
    s.tick(100, false);
    expect(s.timeLeft).toBe(600);
  });

  it('a wrong answer never costs a life', () => {
    const s = new RunSession(0, 0);
    s.recordAnswer(10, 'q1', 'easy', false);
    expect(s.lives).toBe(3);
    expect(s.answers).toHaveLength(1);
  });

  it('records each encounter only once', () => {
    const s = new RunSession(0, 0);
    s.recordAnswer(10, 'q1', 'easy', true);
    s.recordAnswer(10, 'q2', 'easy', false);
    expect(s.answers).toHaveLength(1);
    expect(s.answered.get(10)).toBe(true);
  });

  it('loses un-banked treasures when forced back, keeps banked ones', () => {
    const s = new RunSession(0, 0);
    s.collectTreasure(3);
    s.reachCheckpoint(4, 0);
    s.collectTreasure(7);
    expect(s.treasureCount).toBe(2);
    s.loseLife();
    expect(s.treasureCount).toBe(1);
    expect(s.isTreasureCollected(3)).toBe(true);
    expect(s.isTreasureCollected(7)).toBe(false);
  });

  it('counts walked cells and exploration', () => {
    const s = new RunSession(0, 0);
    expect(s.enterCell(1)).toBe(true);
    expect(s.enterCell(0)).toBe(false);
    expect(s.enterCell(0)).toBe(false);
    expect(s.walkedCells).toBe(2);
  });

  it('snapshots and restores a run faithfully', () => {
    const s = new RunSession(0, 0);
    s.tick(130, true);
    s.recordAnswer(9, 'q', 'hard', true);
    s.collectTreasure(4);
    s.enterCell(1);
    const snap = s.snapshot({
      seed: 1,
      ageGroup: '8-10',
      theme: 'ruins',
      nickname: 'x',
      runId: 'r',
      startedAt: 0,
      usedQuestionIds: ['q'],
      position: { x: 1, z: 2, yaw: 0 },
    });
    const r = RunSession.restore(JSON.parse(JSON.stringify(snap)));
    expect(r.timeLeft).toBe(s.timeLeft);
    expect(r.answers).toEqual(s.answers);
    expect(r.treasureCount).toBe(1);
    expect(r.visited.has(1)).toBe(true);
    expect(r.tick(1, true)).toEqual([]); // tension already fired before the snapshot
  });

  it('merchant trade spends treasures and adds time, capped at 10:00', () => {
    const s = new RunSession(0, 0);
    s.collectTreasure(1);
    s.collectTreasure(2);
    s.tick(30, true);
    expect(s.tradeTreasuresForTime(2, 60)).toBe(true);
    expect(s.timeLeft).toBe(600);
    expect(s.treasureCount).toBe(0);
    expect(s.tradeTreasuresForTime(2, 60)).toBe(false);
  });
});

describe('scoring', () => {
  it('weights correct answers by difficulty', () => {
    expect(triviaPoints('easy')).toBe(100);
    expect(triviaPoints('medium')).toBe(125);
    expect(triviaPoints('hard')).toBe(150);
    expect(triviaPoints('expert')).toBe(200);
  });

  it('accounts for every component transparently', () => {
    const r = calculateScore({
      ...baseInput,
      answers: [
        { questionId: 'a', difficulty: 'hard', correct: true, encounterCell: 1 },
        { questionId: 'b', difficulty: 'expert', correct: true, encounterCell: 2 },
        { questionId: 'c', difficulty: 'easy', correct: false, encounterCell: 3 },
      ],
      treasures: 3,
      livesLost: 1,
      livesRemaining: 2,
      timeLeftSec: 245.4,
      victory: true,
      optimalPathCells: 40,
      walkedCells: 50,
    });
    expect(r.trivia).toBe(350);
    expect(r.timeBonus).toBe(245);
    expect(r.livesBonus).toBe(300);
    expect(r.treasures).toBe(75);
    expect(r.efficiency).toBe(Math.round(300 * 0.8 * 0.8));
    expect(r.penalties).toBe(-25 - 100);
    expect(r.total).toBe(r.trivia + r.timeBonus + r.livesBonus + r.treasures + r.efficiency + r.penalties);
    expect(r.correct).toBe(2);
    expect(r.wrong).toBe(1);
  });

  it('gives no escape bonuses on game over', () => {
    const r = calculateScore({ ...baseInput, timeLeftSec: 0, livesRemaining: 0, livesLost: 3 });
    expect(r.timeBonus + r.livesBonus + r.efficiency).toBe(0);
  });

  it('never goes negative', () => {
    const r = calculateScore({
      ...baseInput,
      answers: Array.from({ length: 8 }, (_, i) => ({ questionId: `${i}`, difficulty: 'easy' as const, correct: false, encounterCell: i })),
      livesLost: 3,
      livesRemaining: 0,
      specialPoints: -500,
    });
    expect(r.total).toBe(0);
  });

  it('caps treasures so they never dominate trivia skill', () => {
    const r = calculateScore({ ...baseInput, treasures: 1000 });
    expect(r.treasures).toBe(GAME_CONFIG.scoring.treasureCap);
    expect(r.treasures).toBeLessThan(3 * triviaPoints('easy'));
  });

  it('route efficiency is bounded to [0, 1]', () => {
    expect(routeEfficiency(40, 20)).toBe(1);
    expect(routeEfficiency(40, 80)).toBe(0.5);
    expect(routeEfficiency(0, 80)).toBe(0);
  });

  it('never exceeds the theoretical maximum', () => {
    const r = calculateScore({
      ...baseInput,
      answers: Array.from({ length: 8 }, (_, i) => ({ questionId: `${i}`, difficulty: 'expert' as const, correct: true, encounterCell: i })),
      treasures: 9,
      timeLeftSec: 600,
      victory: true,
      walkedCells: 40,
    });
    expect(r.total).toBeLessThanOrEqual(maxPossibleScore(8, 9));
  });
});

describe('game state machine', () => {
  const play = (): GameMachine => {
    const m = new GameMachine();
    for (const p of ['MENU', 'AGE_SELECTION', 'PLAYER_SETUP', 'LOADING', 'INTRO_CINEMATIC', 'PLAYING'] as const) {
      expect(m.transition(p)).toBe(true);
    }
    return m;
  };

  it('walks the full happy path', () => {
    const m = play();
    for (const p of ['CREATURE_ENCOUNTER', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'ROUTE_HINT', 'PLAYING', 'VICTORY', 'SCORE_SUMMARY', 'LEADERBOARD'] as const) {
      expect(m.transition(p)).toBe(true);
    }
  });

  it('has no route-selection phase: after a question the player is simply back in control', () => {
    const m = play();
    m.transition('CREATURE_ENCOUNTER');
    m.transition('QUESTION_ACTIVE');
    m.transition('QUESTION_RESULT');
    // Correct → ROUTE_HINT (walkable); incorrect → PLAYING (walkable). Both allow movement.
    expect(m.can('ROUTE_HINT')).toBe(true);
    expect(m.can('PLAYING')).toBe(true);
    expect(MOVEMENT_PHASES.has('ROUTE_HINT')).toBe(true);
    expect(MOVEMENT_PHASES.has('PLAYING')).toBe(true);
    expect(MOVEMENT_PHASES.has('QUESTION_ACTIVE')).toBe(false);
  });

  it('rejects illegal transitions', () => {
    const m = new GameMachine();
    m.transition('MENU');
    expect(m.transition('VICTORY')).toBe(false);
    expect(m.phase).toBe('MENU');
  });

  it('pauses and resumes to the exact previous phase', () => {
    const m = play();
    m.transition('CREATURE_ENCOUNTER');
    m.transition('QUESTION_ACTIVE');
    m.transition('PAUSED', { push: true });
    m.transition('SETTINGS', { push: true });
    m.back('PAUSED');
    expect(m.phase).toBe('PAUSED');
    m.back('PLAYING');
    expect(m.phase).toBe('QUESTION_ACTIVE');
  });

  it('runs the clock during questions but not while paused', () => {
    expect(CLOCK_PHASES.has('QUESTION_ACTIVE')).toBe(true);
    expect(CLOCK_PHASES.has('PAUSED')).toBe(false);
    expect(CLOCK_PHASES.has('LIFE_LOST')).toBe(false);
  });

  it('life lost → checkpoint → playing', () => {
    const m = play();
    expect(m.transition('LIFE_LOST')).toBe(true);
    expect(m.transition('CHECKPOINT')).toBe(true);
    expect(m.transition('PLAYING')).toBe(true);
  });
});
