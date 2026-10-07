/** localStorage wrapper that never throws (private mode, quota, disabled storage). */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const KEYS = {
  settings: 'tm.settings.v1',
  run: 'tm.run.v1',
  recentQuestions: 'tm.recentQuestions.v1',
  playerId: 'tm.playerId',
  localLeaderboard: 'tm.leaderboard.v1',
  pending: 'tm.pendingSubmissions.v1',
  lastSetup: 'tm.lastSetup.v1',
  personalBest: 'tm.personalBest.v1',
} as const;

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Anonymous, random per-device id. No personal information. */
export function playerId(): string {
  let id = storage.get<string | null>(KEYS.playerId, null);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = uuid();
    storage.set(KEYS.playerId, id);
  }
  return id;
}

/** Recently asked question ids (across runs) so repeat players see fresh questions. */
export function recentQuestions(): Set<string> {
  return new Set(storage.get<string[]>(KEYS.recentQuestions, []));
}

export function rememberQuestions(ids: string[]): void {
  const prev = storage.get<string[]>(KEYS.recentQuestions, []);
  const merged = [...ids, ...prev.filter((id) => !ids.includes(id))].slice(0, 220);
  storage.set(KEYS.recentQuestions, merged);
}
