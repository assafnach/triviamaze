import { useStore } from '@/state/store';

type DevApi = Record<string, (...args: unknown[]) => unknown>;

/** Development-only. Never bundled in production (guarded by import.meta.env.DEV at the import site). */
export default function DebugPanel(): React.JSX.Element | null {
  const debug = useStore((s) => s.debug);
  const phase = useStore((s) => s.phase);
  if (!debug) return null;
  const api = (window as unknown as { __tm?: DevApi }).__tm;
  const call = (name: string, ...args: unknown[]) => () => api?.[name]?.(...args);
  return (
    <div className="debug" dir="ltr">
      <div>
        FPS {debug.fps} · calls {debug.drawCalls} · tris {debug.triangles}
      </div>
      <div>
        phase {phase} · seed {debug.seed}
      </div>
      <div>
        pos {debug.x}, {debug.z} · cell {debug.cell}
      </div>
      <div>question {debug.questionId || '—'}</div>
      <div className="debug-buttons">
        <button onClick={call('teleportToEncounter', 0)}>→ creature 0</button>
        <button onClick={call('teleportToEncounter', 1)}>→ creature 1</button>
        <button onClick={call('teleportToExit')}>→ exit</button>
        <button onClick={call('teleportToCheckpoint')}>→ checkpoint</button>
        <button onClick={call('skipQuestion')}>skip dialog</button>
        <button onClick={call('answerCorrect')}>answer ✓</button>
        <button onClick={call('answerWrong')}>answer ✗</button>
        <button onClick={call('setTime', 125)}>time 2:05</button>
        <button onClick={call('setTime', 32)}>time 0:32</button>
        <button onClick={call('expireTimer')}>expire timer</button>
        <button onClick={call('resetTimer')}>reset timer</button>
        <button onClick={call('addLife')}>+life</button>
        <button onClick={call('removeLife')}>−life</button>
        <button onClick={call('forceVictory')}>victory</button>
        <button onClick={call('forceGameOver')}>game over</button>
        <button onClick={call('regenerate')}>regenerate</button>
        <button onClick={call('toggleColliders')}>colliders</button>
      </div>
    </div>
  );
}
