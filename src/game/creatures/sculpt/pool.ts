import { meshPrims, type MeshData, type MeshRegion, type Prim } from './mesher';

/**
 * Meshes sculpts on a small pool of Web Workers so a whole cast builds in parallel without
 * freezing the loading screen. Results are memoised for the session (same sculpt + resolution →
 * same mesh), so later runs reuse them instantly. Jobs carry a priority (the creatures the player
 * will meet first jump the queue) and can be cancelled when the scene that asked for them is gone.
 */
export interface JobOptions {
  /** Higher runs first. */
  priority?: number;
  signal?: AbortSignal;
}

interface Pending {
  resolve: (m: MeshData) => void;
  reject: (e: Error) => void;
}

interface Queued {
  job: { id: number; prims: Prim[]; boneCount: number; voxel: number; opts: MeshRegion };
  p: Pending;
  priority: number;
  signal?: AbortSignal;
  key: string;
}

const cache = new Map<string, Promise<MeshData>>();
let workers: Worker[] | null = null;
let busy: number[] = [];
let queue: Queued[] = [];
const pending = new Map<number, Pending>();
let nextId = 1;

function poolSize(): number {
  const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  // Leave room for the page and the GPU process (shader compilation runs alongside).
  return Math.max(1, Math.min(4, hw - 2));
}

function ensureWorkers(): Worker[] | null {
  if (workers) return workers;
  if (typeof Worker === 'undefined') return null;
  try {
    workers = Array.from({ length: poolSize() }, (_, i) => {
      const w = new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<{ id: number; mesh?: MeshData; error?: string }>) => {
        const job = pending.get(ev.data.id);
        pending.delete(ev.data.id);
        busy[i] = 0;
        if (job) {
          if (ev.data.mesh) job.resolve(ev.data.mesh);
          else job.reject(new Error(ev.data.error ?? 'mesher failed'));
        }
        pump();
      };
      return w;
    });
    busy = workers.map(() => 0);
    return workers;
  } catch {
    workers = null;
    return null;
  }
}

function pump(): void {
  if (!workers) return;
  for (let i = 0; i < workers.length && queue.length > 0; i++) {
    if (busy[i]) continue;
    // Highest priority first; first-come within a priority.
    let best = 0;
    for (let q = 1; q < queue.length; q++) if ((queue[q] as Queued).priority > (queue[best] as Queued).priority) best = q;
    const next = queue.splice(best, 1)[0] as Queued;
    busy[i] = 1;
    pending.set(next.job.id, next.p);
    (workers[i] as Worker).postMessage(next.job);
  }
}

/** Drops queued (not yet started) jobs belonging to an aborted request. */
function cancel(signal: AbortSignal): void {
  const dropped = queue.filter((q) => q.signal === signal);
  queue = queue.filter((q) => q.signal !== signal);
  for (const q of dropped) {
    cache.delete(q.key);
    q.p.reject(new DOMException('cancelled', 'AbortError'));
  }
}

/** Cheap content hash (FNV-1a over the JSON) used as the memo key. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

export function meshAsync(prims: Prim[], boneCount: number, voxel: number, opts: MeshRegion = {}, job: JobOptions = {}): Promise<MeshData> {
  const key = `${voxel.toFixed(5)}:${boneCount}:${hash(JSON.stringify(opts))}:${hash(JSON.stringify(prims))}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Development aid: tools can capture jobs to profile the mesher outside the browser.
  if (import.meta.env.DEV) (globalThis as { __meshJobs?: unknown[] }).__meshJobs?.push({ prims, boneCount, voxel, opts });
  if (job.signal?.aborted) return Promise.reject(new DOMException('cancelled', 'AbortError'));
  const ws = ensureWorkers();
  const p: Promise<MeshData> = ws
    ? new Promise<MeshData>((resolve, reject) => {
        queue.push({ job: { id: nextId++, prims, boneCount, voxel, opts }, p: { resolve, reject }, priority: job.priority ?? 0, signal: job.signal, key });
        if (job.signal && !job.signal.aborted) job.signal.addEventListener('abort', () => cancel(job.signal as AbortSignal), { once: true });
        pump();
      }).catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        return meshPrims(prims, boneCount, voxel, opts);
      })
    : Promise.resolve().then(() => meshPrims(prims, boneCount, voxel, opts));
  cache.set(key, p);
  return p;
}
