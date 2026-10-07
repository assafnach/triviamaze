import type { CreatureId } from '@/types';

/** Synthesised speech timbre per creature (see AudioEngine.speak). */
export const CREATURE_VOICES: Record<CreatureId, { pitch: number; speed: number; wave: OscillatorType; formant: number }> = {
  wizard: { pitch: 150, speed: 9, wave: 'sawtooth', formant: 900 },
  goblin: { pitch: 320, speed: 15, wave: 'square', formant: 1600 },
  fairy: { pitch: 720, speed: 16, wave: 'sine', formant: 2600 },
  raven: { pitch: 420, speed: 11, wave: 'square', formant: 1400 },
  dragon: { pitch: 210, speed: 10, wave: 'sawtooth', formant: 700 },
  spirit: { pitch: 380, speed: 8, wave: 'sine', formant: 1900 },
  golem: { pitch: 80, speed: 5, wave: 'sawtooth', formant: 400 },
  elf: { pitch: 330, speed: 10, wave: 'triangle', formant: 2100 },
  mushroom: { pitch: 460, speed: 13, wave: 'triangle', formant: 1800 },
  ghost: { pitch: 260, speed: 9, wave: 'sine', formant: 1200 },
  guardian: { pitch: 280, speed: 8, wave: 'triangle', formant: 2400 },
  fox: { pitch: 360, speed: 13, wave: 'triangle', formant: 1500 },
  sphinx: { pitch: 190, speed: 7, wave: 'triangle', formant: 1000 },
  troll: { pitch: 95, speed: 6, wave: 'sawtooth', formant: 500 },
  witch: { pitch: 300, speed: 12, wave: 'square', formant: 1300 },
  owl: { pitch: 240, speed: 8, wave: 'sine', formant: 900 },
};
