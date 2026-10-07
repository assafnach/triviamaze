/** Deterministic, seedable PRNG (mulberry32). Same seed → same labyrinth, creatures and questions. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(min + (max - min + 1) * this.next());
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1] as T;
  }

  /** Derive an independent child generator (stable for a given label). */
  fork(label: string): Rng {
    return new Rng(hashString(label) ^ Math.floor(this.next() * 0xffffffff));
  }
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  }
  return Math.floor(Math.random() * 0xffffffff);
}

/** Future "daily challenge": everyone gets the same seed on the same date. */
export function dailySeed(date: Date, ageGroup: string): number {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}:${ageGroup}`;
  return hashString(key);
}
