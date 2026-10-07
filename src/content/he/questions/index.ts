import type { AgeGroup, Question } from '@/types';
import { QUESTIONS_5_7 } from './age5to7';
import { QUESTIONS_8_10 } from './age8to10';
import { QUESTIONS_11_13 } from './age11to13';
import { QUESTIONS_14_15 } from './age14to15';
import { QUESTIONS_16_PLUS } from './age16plus';

export const QUESTION_BANK: Record<AgeGroup, Question[]> = {
  '5-7': QUESTIONS_5_7,
  '8-10': QUESTIONS_8_10,
  '11-13': QUESTIONS_11_13,
  '14-15': QUESTIONS_14_15,
  '16+': QUESTIONS_16_PLUS,
};

export const ALL_QUESTIONS: Question[] = Object.values(QUESTION_BANK).flat();
