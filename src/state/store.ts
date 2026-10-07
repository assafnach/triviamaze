import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/config/gameConfig';
import type { ScoreBreakdown } from '@/game/scoring/score';
import { KEYS, storage } from '@/services/storage';
import type { RunSubmission } from '@/services/leaderboard';
import type { AgeGroup, CreatureId, PresentedQuestion, Settings, ThemeId } from '@/types';
import { GameMachine, type Phase } from './machine';

export const machine = new GameMachine();

export interface HudState {
  timeLeft: number;
  lives: number;
  treasures: number;
  score: number;
  /** 0 calm, 1 under two minutes, 2 under thirty seconds. */
  urgency: 0 | 1 | 2;
}

export interface EncounterView {
  creatureId: CreatureId;
  name: string;
  title: string;
  line: string;
  question: PresentedQuestion | null;
  selected: number | null;
  result: 'correct' | 'wrong' | null;
  points: number;
  routePhrase: string | null;
  progress: number;
}

export interface SpecialView {
  kind: 'oracle' | 'merchant';
  name: string;
  title: string;
  line: string;
  canAccept: boolean;
  resolved: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'treasure' | 'checkpoint' | 'warning' | 'caption' | 'speech';
  ttl: number;
}

export interface SummaryData {
  victory: boolean;
  breakdown: ScoreBreakdown;
  questions: number;
  timeSec: number;
  livesLost: number;
  treasures: number;
  submission: RunSubmission | null;
  submitState: 'idle' | 'submitting' | 'done' | 'failed' | 'rejected';
  rank: number | null;
  personalBest: boolean;
  ageGroup: AgeGroup;
}

export interface ResumeInfo {
  theme: ThemeId;
  ageGroup: AgeGroup;
  timeLeft: number;
  lives: number;
}

export type CoachKey = 'move' | 'look' | 'sprint' | 'explore' | 'creatureAhead' | 'followLight' | 'ownWay' | 'map' | null;

export interface DebugInfo {
  fps: number;
  seed: number;
  x: number;
  z: number;
  cell: number;
  questionId: string;
  drawCalls: number;
  triangles: number;
}

interface StoreState {
  phase: Phase;
  settings: Settings;
  ageGroup: AgeGroup;
  nickname: string;
  hud: HudState;
  encounter: EncounterView | null;
  special: SpecialView | null;
  toasts: Toast[];
  summary: SummaryData | null;
  coach: CoachKey;
  loading: { progress: number; themeName: string; lore: string } | null;
  introCard: { name: string; lore: string } | null;
  resume: ResumeInfo | null;
  mapOpen: boolean;
  pointerHint: boolean;
  lifeLostRemaining: number;
  exitDiscovered: boolean;
  debug: DebugInfo | null;
  webglError: boolean;
  isTouch: boolean;
}

interface StoreActions {
  updateSettings(patch: Partial<Settings>): void;
  setSetup(ageGroup: AgeGroup, nickname: string): void;
  pushToast(text: string, kind?: Toast['kind'], ttl?: number): void;
  dropToast(id: number): void;
  set(patch: Partial<StoreState>): void;
}

function loadSettings(): Settings {
  const saved = storage.get<Partial<Settings>>(KEYS.settings, {});
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settings = { ...DEFAULT_SETTINGS, reducedMotion: prefersReduced, ...saved };
  // Stored values come from the browser: an unknown quality name falls back to automatic.
  if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(settings.quality)) settings.quality = 'auto';
  return settings;
}

let toastId = 1;
const lastSetup = storage.get<{ ageGroup: AgeGroup; nickname: string } | null>(KEYS.lastSetup, null);

export const useStore = create<StoreState & StoreActions>((set, get) => ({
  phase: machine.phase,
  settings: loadSettings(),
  ageGroup: lastSetup?.ageGroup ?? '8-10',
  nickname: lastSetup?.nickname ?? '',
  hud: { timeLeft: 600, lives: 3, treasures: 0, score: 0, urgency: 0 },
  encounter: null,
  special: null,
  toasts: [],
  summary: null,
  coach: null,
  loading: null,
  introCard: null,
  resume: null,
  mapOpen: false,
  pointerHint: false,
  lifeLostRemaining: 0,
  exitDiscovered: false,
  debug: null,
  webglError: false,
  isTouch: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    storage.set(KEYS.settings, settings);
    set({ settings });
  },
  setSetup(ageGroup, nickname) {
    storage.set(KEYS.lastSetup, { ageGroup, nickname });
    set({ ageGroup, nickname });
  },
  pushToast(text, kind = 'info', ttl = 3200) {
    const id = toastId++;
    const toasts = [...get().toasts.filter((t) => !(t.kind === kind && kind === 'speech')), { id, text, kind, ttl }].slice(-4);
    set({ toasts });
    window.setTimeout(() => get().dropToast(id), ttl);
  },
  dropToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  set(patch) {
    set(patch);
  },
}));

machine.subscribe((to) => useStore.setState({ phase: to }));

/** Convenience for non-React code. */
export const getState = (): StoreState & StoreActions => useStore.getState();
