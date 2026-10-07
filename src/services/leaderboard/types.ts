import type { AgeGroup, Difficulty, ThemeId } from '@/types';

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  ageGroup: AgeGroup;
  score: number;
  correct: number;
  completionTimeSec: number;
  livesLost: number;
  createdAt: string;
  isMine?: boolean;
}

/** Everything the server needs to independently recompute and sanity-check a score. */
export interface RunSubmission {
  runId: string;
  playerId: string;
  nickname: string;
  ageGroup: AgeGroup;
  seed: number;
  theme: ThemeId;
  startedAt: number;
  completedAt: number;
  completionTimeSec: number;
  score: number;
  answers: { difficulty: Difficulty; correct: boolean }[];
  livesLost: number;
  livesRemaining: number;
  timeLeftSec: number;
  treasures: number;
  specialPoints: number;
  optimalPathCells: number;
  walkedCells: number;
  /** Labyrinth facts (from the deterministic seed). */
  encounterCount: number;
  treasureCount: number;
}

export type SubmitResult =
  | { status: 'ok'; rank?: number }
  | { status: 'rejected'; reason: string }
  | { status: 'failed' };

export interface LeaderboardService {
  readonly kind: 'local' | 'online';
  list(ageGroup: AgeGroup, limit?: number): Promise<LeaderboardEntry[]>;
  submit(sub: RunSubmission): Promise<SubmitResult>;
}
