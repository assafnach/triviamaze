import { useEffect, useRef, useState } from 'react';
import { UI } from '@/content/he/ui';
import { input } from '@/game/input/InputState';
import { useStore } from '@/state/store';
import { useT } from '../hooks';

const RADIUS = 58;

/**
 * Mobile controls: a floating joystick on the LEFT half (physical left, regardless of RTL)
 * and a look pad on the right half. Pushing the stick to its edge breaks into a run.
 */
export function TouchControls({ active }: { active: boolean }): React.JSX.Element {
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const moveId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) {
      input.joyX = 0;
      input.joyY = 0;
      input.touchSprint = false;
      moveId.current = null;
      lookId.current = null;
      setStick(null);
    }
  }, [active]);

  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!active) return;
    input.lastDevice = 'touch';
    const leftHalf = e.clientX < window.innerWidth * 0.45;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (leftHalf && moveId.current === null) {
      moveId.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY };
      setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    } else if (!leftHalf && lookId.current === null) {
      lookId.current = e.pointerId;
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.pointerId === moveId.current) {
      let dx = e.clientX - origin.current.x;
      let dy = e.clientY - origin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      const dead = 0.12;
      const nx = dx / RADIUS;
      const ny = -dy / RADIUS;
      const mag = Math.hypot(nx, ny);
      input.joyX = mag < dead ? 0 : nx;
      input.joyY = mag < dead ? 0 : ny;
      input.touchSprint = mag > 0.96;
      setStick({ x: origin.current.x, y: origin.current.y, dx, dy });
    } else if (e.pointerId === lookId.current) {
      input.lastDevice = 'touch';
      input.addLook(e.clientX - lookLast.current.x, e.clientY - lookLast.current.y);
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.pointerId === moveId.current) {
      moveId.current = null;
      input.joyX = 0;
      input.joyY = 0;
      input.touchSprint = false;
      setStick(null);
    } else if (e.pointerId === lookId.current) {
      lookId.current = null;
    }
  };

  return (
    <div className="touch-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden="true">
      {stick ? (
        <div className="joystick" style={{ left: stick.x - RADIUS, top: stick.y - RADIUS }}>
          <div className="joystick-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
        </div>
      ) : (
        <div className="joystick joystick-ghost">
          <div className="joystick-knob" />
        </div>
      )}
    </div>
  );
}

export function OrientationHint(): React.JSX.Element | null {
  const t = useT();
  const isTouch = useStore((s) => s.isTouch);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const on = (): void => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (!isTouch || !portrait || dismissed) return null;
  return (
    <div className="orientation-hint" role="status">
      <span className="rotate-icon" aria-hidden="true">
        ⟳
      </span>
      <span>{t(UI.orientation)}</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label={UI.common.close}>
        ✕
      </button>
    </div>
  );
}
