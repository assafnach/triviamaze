import type { AgeGroup, Category, Difficulty, Question } from '@/types';

/**
 * Compact authoring row: [category, difficulty, question, [correct, distractor, distractor, distractor], explanation].
 * The correct answer is always authored first; answer order is randomised every time a question is presented.
 */
export type QuestionRow = [Category, Difficulty, string, [string, string, string, string], string];

/** Wraps a left-to-right fragment (formula, number with sign, Latin symbol) in a Unicode isolate. */
export const ltr = (s: string): string => `\u2066${s}\u2069`;

export function defineQuestions(ageGroup: AgeGroup, prefix: string, rows: QuestionRow[]): Question[] {
  return rows.map(([category, difficulty, question, answers, explanation], i) => ({
    id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
    ageGroup,
    category,
    difficulty,
    question,
    answers,
    correctAnswer: 0,
    explanation,
  }));
}
