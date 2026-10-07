import { GAME_CONFIG } from '@/config/gameConfig';
import type { AgeGroup, Difficulty, ThemeId } from '@/types';
import type { AnswerRecord } from '../scoring/score';

export interface Checkpoint {
  cell: number;
  /** Camera yaw when respawning here. */
  yaw: number;
}

export type SessionEvent = 'tension' | 'urgent' | 'lifeLost' | 'gameOver';

export interface RunSnapshot {
  version: 1;
  seed: number;
  ageGroup: AgeGroup;
  theme: ThemeId;
  nickname: string;
  runId: string;
  startedAt: number;
  timeLeft: number;
  lives: number;
  livesLost: number;
  elapsed: number;
  answers: AnswerRecord[];
  answered: [number, boolean][];
  treasuresBanked: number[];
  treasuresPending: number[];
  treasuresSpent: number;
  checkpoint: Checkpoint;
  visited: number[];
  walkedCells: number;
  currentCell: number;
  specialPoints: number;
  specialsUsed: number[];
  usedQuestionIds: string[];
  position: { x: number; z: number; yaw: number };
  mapRevealed: number[];
}

/**
 * Pure run state: clock, lives, checkpoints, answers, treasures, exploration.
 * No rendering or DOM — fully unit-testable.
 */
export class RunSession {
  timeLeft: number = GAME_CONFIG.lifeDurationSec;
  lives: number = GAME_CONFIG.startingLives;
  livesLost = 0;
  /** Total active play time across all lives (seconds). */
  elapsed = 0;
  readonly answers: AnswerRecord[] = [];
  /** Encounter cell → answered correctly? */
  readonly answered = new Map<number, boolean>();
  /** Treasures safely secured at a checkpoint. */
  readonly treasuresBanked = new Set<number>();
  /** Treasures collected since the last checkpoint — lost if the labyrinth forces you back. */
  readonly treasuresPending = new Set<number>();
  treasuresSpent = 0;
  checkpoint: Checkpoint;
  readonly visited = new Set<number>();
  readonly mapRevealed = new Set<number>();
  walkedCells = 0;
  currentCell: number;
  specialPoints = 0;
  readonly specialsUsed = new Set<number>();
  finished = false;
  private tensionFired = false;
  private urgentFired = false;

  constructor(startCell: number, startYaw: number) {
    this.checkpoint = { cell: startCell, yaw: startYaw };
    this.currentCell = startCell;
    this.visited.add(startCell);
  }

  get treasureCount(): number {
    return Math.max(0, this.treasuresBanked.size + this.treasuresPending.size - this.treasuresSpent);
  }

  get correctCount(): number {
    return this.answers.filter((a) => a.correct).length;
  }

  /** Advance the clock. Returns events that happened during this tick. */
  tick(dt: number, clockRunning: boolean): SessionEvent[] {
    if (this.finished || !clockRunning || dt <= 0) return [];
    const events: SessionEvent[] = [];
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (!this.tensionFired && this.timeLeft <= GAME_CONFIG.tensionThresholdSec) {
      this.tensionFired = true;
      events.push('tension');
    }
    if (!this.urgentFired && this.timeLeft <= GAME_CONFIG.urgentThresholdSec) {
      this.urgentFired = true;
      events.push('urgent');
    }
    if (this.timeLeft <= 0) {
      events.push(this.loseLife());
    }
    return events;
  }

  /** Exactly one life is removed. Returns 'gameOver' when none remain. */
  loseLife(): 'lifeLost' | 'gameOver' {
    this.lives = Math.max(0, this.lives - 1);
    this.livesLost++;
    // Treasures picked up since the last checkpoint return to the labyrinth.
    this.treasuresPending.clear();
    if (this.lives <= 0) {
      this.finished = true;
      this.timeLeft = 0;
      return 'gameOver';
    }
    this.timeLeft = GAME_CONFIG.lifeDurationSec;
    this.tensionFired = false;
    this.urgentFired = false;
    this.currentCell = this.checkpoint.cell;
    return 'lifeLost';
  }

  reachCheckpoint(cell: number, yaw: number): boolean {
    const isNew = this.checkpoint.cell !== cell;
    this.checkpoint = { cell, yaw };
    for (const t of this.treasuresPending) this.treasuresBanked.add(t);
    this.treasuresPending.clear();
    return isNew;
  }

  enterCell(cell: number): boolean {
    if (cell === this.currentCell) return false;
    this.currentCell = cell;
    this.walkedCells++;
    const firstVisit = !this.visited.has(cell);
    this.visited.add(cell);
    return firstVisit;
  }

  recordAnswer(encounterCell: number, questionId: string, difficulty: Difficulty, correct: boolean): void {
    if (this.answered.has(encounterCell)) return;
    this.answered.set(encounterCell, correct);
    this.answers.push({ questionId, difficulty, correct, encounterCell });
  }

  isTreasureCollected(cell: number): boolean {
    return this.treasuresBanked.has(cell) || this.treasuresPending.has(cell);
  }

  collectTreasure(cell: number): boolean {
    if (this.isTreasureCollected(cell)) return false;
    this.treasuresPending.add(cell);
    return true;
  }

  /** Merchant trade: spend treasures for extra time. */
  tradeTreasuresForTime(count: number, seconds: number): boolean {
    if (this.treasureCount < count) return false;
    this.treasuresSpent += count;
    this.timeLeft = Math.min(GAME_CONFIG.lifeDurationSec, this.timeLeft + seconds);
    return true;
  }

  addSpecialPoints(points: number): void {
    this.specialPoints += points;
  }

  snapshot(meta: {
    seed: number;
    ageGroup: AgeGroup;
    theme: ThemeId;
    nickname: string;
    runId: string;
    startedAt: number;
    usedQuestionIds: string[];
    position: { x: number; z: number; yaw: number };
  }): RunSnapshot {
    return {
      version: 1,
      ...meta,
      timeLeft: this.timeLeft,
      lives: this.lives,
      livesLost: this.livesLost,
      elapsed: this.elapsed,
      answers: this.answers.slice(),
      answered: [...this.answered],
      treasuresBanked: [...this.treasuresBanked],
      treasuresPending: [...this.treasuresPending],
      treasuresSpent: this.treasuresSpent,
      checkpoint: { ...this.checkpoint },
      visited: [...this.visited],
      walkedCells: this.walkedCells,
      currentCell: this.currentCell,
      specialPoints: this.specialPoints,
      specialsUsed: [...this.specialsUsed],
      mapRevealed: [...this.mapRevealed],
    };
  }

  static restore(s: RunSnapshot): RunSession {
    const r = new RunSession(s.checkpoint.cell, s.checkpoint.yaw);
    r.timeLeft = s.timeLeft;
    r.lives = s.lives;
    r.livesLost = s.livesLost;
    r.elapsed = s.elapsed;
    r.answers.push(...s.answers);
    for (const [c, ok] of s.answered) r.answered.set(c, ok);
    for (const t of s.treasuresBanked) r.treasuresBanked.add(t);
    for (const t of s.treasuresPending) r.treasuresPending.add(t);
    r.treasuresSpent = s.treasuresSpent;
    r.visited.clear();
    for (const v of s.visited) r.visited.add(v);
    for (const v of s.mapRevealed) r.mapRevealed.add(v);
    r.walkedCells = s.walkedCells;
    r.currentCell = s.currentCell;
    r.specialPoints = s.specialPoints;
    for (const c of s.specialsUsed) r.specialsUsed.add(c);
    r.tensionFired = r.timeLeft <= GAME_CONFIG.tensionThresholdSec;
    r.urgentFired = r.timeLeft <= GAME_CONFIG.urgentThresholdSec;
    return r;
  }
}
