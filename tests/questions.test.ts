import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS, QUESTION_BANK } from '@/content/he/questions';
import { QuestionSelector, presentQuestion } from '@/game/questions/selector';
import { validateQuestions } from '@/game/questions/validate';
import { AGE_GROUPS } from '@/types';
import { Rng } from '@/utils/rng';

describe('question database', () => {
  it('passes structural and quality validation', () => {
    expect(validateQuestions(ALL_QUESTIONS)).toEqual([]);
  });

  it('has a substantial bank for every age group', () => {
    for (const age of AGE_GROUPS) {
      const min = age === '16+' ? 150 : 100;
      expect(QUESTION_BANK[age].length, `age ${age}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('has globally unique ids', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stores every question under its own age group', () => {
    for (const age of AGE_GROUPS) for (const q of QUESTION_BANK[age]) expect(q.ageGroup).toBe(age);
  });

  it('covers several categories and difficulties per age group', () => {
    for (const age of AGE_GROUPS) {
      const qs = QUESTION_BANK[age];
      expect(new Set(qs.map((q) => q.category)).size).toBeGreaterThanOrEqual(8);
      expect(new Set(qs.map((q) => q.difficulty)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('includes genuinely hard material for 16+', () => {
    const hardish = QUESTION_BANK['16+'].filter((q) => q.difficulty === 'hard' || q.difficulty === 'expert');
    expect(hardish.length / QUESTION_BANK['16+'].length).toBeGreaterThan(0.4);
  });
});

describe('question presentation', () => {
  it('randomises the position of the correct answer', () => {
    const q = QUESTION_BANK['8-10'][0]!;
    const rng = new Rng(7);
    const positions = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const p = presentQuestion(q, rng);
      expect(p.answers[p.correctIndex]).toBe(q.answers[q.correctAnswer]);
      expect([...p.answers].sort()).toEqual([...q.answers].sort());
      positions.add(p.correctIndex);
    }
    expect(positions.size).toBe(4);
  });

  it('spreads the correct answer evenly across positions', () => {
    const rng = new Rng(99);
    const counts = [0, 0, 0, 0];
    for (const q of ALL_QUESTIONS) counts[presentQuestion(q, rng).correctIndex]!++;
    const expected = ALL_QUESTIONS.length / 4;
    for (const c of counts) expect(Math.abs(c - expected) / expected).toBeLessThan(0.2);
  });
});

describe('question selector', () => {
  it('never repeats a question within a run', () => {
    for (const age of AGE_GROUPS) {
      const sel = new QuestionSelector(age, new Rng(3));
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const p = sel.next(i / 40);
        expect(seen.has(p.question.id)).toBe(false);
        expect(p.question.ageGroup).toBe(age);
        seen.add(p.question.id);
      }
    }
  });

  it('avoids the same category twice in a row', () => {
    const sel = new QuestionSelector('11-13', new Rng(12));
    let last = '';
    for (let i = 0; i < 30; i++) {
      const p = sel.next(0.5);
      expect(p.question.category).not.toBe(last);
      last = p.question.category;
    }
  });

  it('avoids recently seen questions when possible', () => {
    const recent = new Set(QUESTION_BANK['5-7'].slice(0, 60).map((q) => q.id));
    const sel = new QuestionSelector('5-7', new Rng(5), recent);
    for (let i = 0; i < 20; i++) expect(recent.has(sel.next(0.3).question.id)).toBe(false);
  });

  it('ramps up difficulty with progress', () => {
    const score = { easy: 0, medium: 1, hard: 2, expert: 3 } as const;
    const avg = (progress: number): number => {
      let total = 0;
      for (let s = 0; s < 200; s++) {
        total += score[new QuestionSelector('16+', new Rng(s)).next(progress).question.difficulty];
      }
      return total / 200;
    };
    expect(avg(1)).toBeGreaterThan(avg(0));
  });

  it('is deterministic for a seed (daily challenge ready)', () => {
    const a = new QuestionSelector('14-15', new Rng(77));
    const b = new QuestionSelector('14-15', new Rng(77));
    for (let i = 0; i < 10; i++) expect(a.next(i / 10)).toEqual(b.next(i / 10));
  });
});
