import { useEffect, useRef } from 'react';
import { g, type G } from '@/content/he/gender';
import { audio } from '@/game/audio/AudioEngine';
import { useStore } from '@/state/store';

/** Resolves gendered Hebrew strings for the player's chosen form of address. */
export function useT(): (value: G) => string {
  const address = useStore((s) => s.settings.address);
  return (value: G) => g(value, address);
}

/** Moves keyboard focus into a freshly opened screen (keyboard + screen-reader friendly). */
export function useAutoFocus<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button, [href], input, select');
    target?.focus({ preventScroll: true });
  }, []);
  return ref;
}

export const uiSound = {
  click: (): void => audio.play('ui'),
  hover: (): void => audio.play('hover'),
};
