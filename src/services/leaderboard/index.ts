import type { AgeGroup } from '@/types';
import { KEYS, playerId, storage } from '../storage';
import type { LeaderboardEntry, LeaderboardService, RunSubmission, SubmitResult } from './types';
import { validateSubmission } from './validation';

export type { LeaderboardEntry, RunSubmission, SubmitResult } from './types';

interface StoredEntry extends LeaderboardEntry {
  playerId: string;
}

/** On-device leaderboard used when no backend is configured (and as an offline fallback). */
class LocalLeaderboard implements LeaderboardService {
  readonly kind = 'local' as const;

  private all(): StoredEntry[] {
    return storage.get<StoredEntry[]>(KEYS.localLeaderboard, []);
  }

  async list(ageGroup: AgeGroup, limit = 50): Promise<LeaderboardEntry[]> {
    const me = playerId();
    return this.all()
      .filter((e) => e.ageGroup === ageGroup)
      .sort((a, b) => b.score - a.score || a.completionTimeSec - b.completionTimeSec)
      .slice(0, limit)
      .map((e) => ({ ...e, isMine: e.playerId === me }));
  }

  async submit(sub: RunSubmission): Promise<SubmitResult> {
    const v = validateSubmission(sub);
    if (!v.ok) return { status: 'rejected', reason: v.reason };
    const all = this.all();
    if (all.some((e) => e.id === sub.runId)) return { status: 'rejected', reason: 'duplicate' };
    const entry: StoredEntry = {
      id: sub.runId,
      playerId: sub.playerId,
      nickname: sub.nickname,
      ageGroup: sub.ageGroup,
      score: sub.score,
      correct: sub.answers.filter((a) => a.correct).length,
      completionTimeSec: Math.round(sub.completionTimeSec),
      livesLost: sub.livesLost,
      createdAt: new Date(sub.completedAt).toISOString(),
    };
    // Keep the top 50 per age group.
    const next = [...all, entry];
    const kept: StoredEntry[] = [];
    for (const age of new Set(next.map((e) => e.ageGroup))) {
      kept.push(...next.filter((e) => e.ageGroup === age).sort((a, b) => b.score - a.score).slice(0, 50));
    }
    storage.set(KEYS.localLeaderboard, kept);
    const ranked = kept.filter((e) => e.ageGroup === sub.ageGroup).sort((a, b) => b.score - a.score);
    const rank = ranked.findIndex((e) => e.id === sub.runId) + 1;
    return { status: 'ok', rank: rank > 0 ? rank : undefined };
  }
}

/** Supabase (PostgREST RPC) leaderboard. Only the public anon key is used client-side. */
class SupabaseLeaderboard implements LeaderboardService {
  readonly kind = 'online' as const;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  private async rpc<T>(fn: string, body: unknown, timeoutMs = 8000): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async list(ageGroup: AgeGroup, limit = 50): Promise<LeaderboardEntry[]> {
    const rows = await this.rpc<
      { id: string; nickname: string; age_group: AgeGroup; score: number; correct: number; completion_time: number; lives_lost: number; created_at: string; player_id: string }[]
    >('get_leaderboard', { p_age_group: ageGroup, p_limit: limit });
    const me = playerId();
    return rows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      ageGroup: r.age_group,
      score: r.score,
      correct: r.correct,
      completionTimeSec: r.completion_time,
      livesLost: r.lives_lost,
      createdAt: r.created_at,
      isMine: r.player_id === me,
    }));
  }

  async submit(sub: RunSubmission): Promise<SubmitResult> {
    const v = validateSubmission(sub);
    if (!v.ok) return { status: 'rejected', reason: v.reason };
    try {
      const r = await this.rpc<{ ok: boolean; reason?: string; rank?: number }>('submit_run', { payload: sub });
      if (r.ok) return { status: 'ok', rank: r.rank };
      return { status: 'rejected', reason: r.reason ?? 'rejected' };
    } catch {
      return { status: 'failed' };
    }
  }
}

function createService(): LeaderboardService {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key && /^https:\/\//.test(url)) return new SupabaseLeaderboard(url, key);
  return new LocalLeaderboard();
}

export const leaderboard: LeaderboardService = createService();

// ── Offline retry queue ──────────────────────────────────────────────────────────────────

export function queueSubmission(sub: RunSubmission): void {
  const q = storage.get<RunSubmission[]>(KEYS.pending, []);
  if (!q.some((s) => s.runId === sub.runId)) storage.set(KEYS.pending, [...q, sub].slice(-10));
}

/** Retries queued submissions (on startup and when the network returns). */
export async function flushPendingSubmissions(): Promise<void> {
  const q = storage.get<RunSubmission[]>(KEYS.pending, []);
  if (q.length === 0) return;
  const remaining: RunSubmission[] = [];
  for (const sub of q) {
    const r = await leaderboard.submit(sub);
    if (r.status === 'failed') remaining.push(sub);
  }
  storage.set(KEYS.pending, remaining);
}
