import { MAZE_PROFILES } from '@/config/gameConfig';
import { QUESTION_BANK } from '@/content/he/questions';
import { DIFFICULTIES, type AgeGroup, type Category, type Difficulty, type PresentedQuestion, type Question } from '@/types';
import type { Rng } from '@/utils/rng';

/**
 * Picks questions for a run:
 *  - never repeats a question within a run,
 *  - avoids questions seen in recent runs (when possible),
 *  - avoids the same category twice in a row,
 *  - ramps difficulty up as the player gets deeper into the labyrinth.
 */
export class QuestionSelector {
  private readonly pool: Question[];
  private readonly used = new Set<string>();
  private lastCategory: Category | null = null;

  constructor(
    private readonly ageGroup: AgeGroup,
    private readonly rng: Rng,
    private readonly recentlySeen: ReadonlySet<string> = new Set(),
    pool?: Question[],
  ) {
    this.pool = pool ?? QUESTION_BANK[ageGroup];
  }

  /** Mark questions as already used (e.g. when resuming a saved run). */
  markUsed(ids: Iterable<string>): void {
    for (const id of ids) this.used.add(id);
  }

  get usedIds(): string[] {
    return [...this.used];
  }

  /**
   * @param progress 0 at the entrance, 1 at the exit — later encounters lean harder.
   */
  next(progress: number): PresentedQuestion {
    const weights = this.difficultyWeights(progress);
    let candidates = this.pool.filter((q) => !this.used.has(q.id) && !this.recentlySeen.has(q.id));
    if (candidates.length === 0) candidates = this.pool.filter((q) => !this.used.has(q.id));
    if (candidates.length === 0) {
      // Exhausted the bank in a single run — start over rather than fail.
      this.used.clear();
      candidates = this.pool.slice();
    }
    const varied = candidates.filter((q) => q.category !== this.lastCategory);
    if (varied.length > 0) candidates = varied;
    const available = DIFFICULTIES.filter((d) => candidates.some((q) => q.difficulty === d));
    const difficulty = this.rng.weighted(available, (d) => weights[d]);
    const question = this.rng.pick(candidates.filter((q) => q.difficulty === difficulty));
    this.used.add(question.id);
    this.lastCategory = question.category;
    return presentQuestion(question, this.rng);
  }

  private difficultyWeights(progress: number): Record<Difficulty, number> {
    const base = MAZE_PROFILES[this.ageGroup].difficultyWeights;
    const p = Math.min(1, Math.max(0, progress));
    // Shift weight from easy toward hard/expert as the run progresses.
    return {
      easy: base.easy * (1.4 - 0.9 * p),
      medium: base.medium,
      hard: base.hard * (0.7 + 0.7 * p),
      expert: base.expert * (0.4 + 1.2 * p),
    };
  }
}

/** Shuffles answer order so the correct answer lands in a random position. */
export function presentQuestion(question: Question, rng: Rng): PresentedQuestion {
  const order = rng.shuffle([0, 1, 2, 3]);
  return {
    question,
    answers: order.map((i) => question.answers[i] as string),
    correctIndex: order.indexOf(question.correctAnswer),
  };
}
