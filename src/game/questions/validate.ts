import { AGE_GROUPS, CATEGORIES, DIFFICULTIES, type Question } from '@/types';

export interface QuestionIssue {
  id: string;
  problem: string;
}

const HEBREW_LETTER = /[א-ת]/;
/** Strip bidi isolates and whitespace for comparisons. */
const normalise = (s: string): string => s.replace(/[\u2066-\u2069\u200E\u200F]/g, '').trim();

/**
 * Structural and quality validation for the question database.
 * Runs in the test suite and (in development) at startup.
 */
export function validateQuestions(questions: Question[]): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  for (const q of questions) {
    const add = (problem: string): void => {
      issues.push({ id: q.id, problem });
    };
    if (ids.has(q.id)) add('duplicate id');
    ids.add(q.id);
    if (!AGE_GROUPS.includes(q.ageGroup)) add(`invalid age group ${q.ageGroup}`);
    if (!CATEGORIES.includes(q.category)) add(`invalid category ${q.category}`);
    if (!DIFFICULTIES.includes(q.difficulty)) add(`invalid difficulty ${q.difficulty}`);
    if (!normalise(q.question)) add('empty question');
    if (!HEBREW_LETTER.test(q.question)) add('question is not in Hebrew');
    if (!normalise(q.explanation)) add('empty explanation');
    if (!HEBREW_LETTER.test(q.explanation)) add('explanation is not in Hebrew');
    if (!Array.isArray(q.answers) || q.answers.length !== 4) add('must have exactly 4 answers');
    if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 3) add('invalid correct answer index');
    const normalised = q.answers.map(normalise);
    if (normalised.some((a) => a.length === 0)) add('empty answer');
    if (new Set(normalised).size !== normalised.length) add('duplicate answers');
    // The correct answer must not give itself away by being much longer than every distractor.
    const correct = normalised[q.correctAnswer] ?? '';
    const longestDistractor = Math.max(...normalised.filter((_, i) => i !== q.correctAnswer).map((a) => a.length));
    if (correct.length > 12 && correct.length > longestDistractor * 1.8) add('correct answer is conspicuously longer');
    const textKey = `${q.ageGroup}|${normalise(q.question)}`;
    if (texts.has(textKey)) add(`duplicate question text (also ${texts.get(textKey)})`);
    texts.set(textKey, q.id);
  }
  return issues;
}
