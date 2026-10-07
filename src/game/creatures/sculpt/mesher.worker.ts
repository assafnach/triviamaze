/// <reference lib="webworker" />
import { meshPrims, type MeshRegion, type Prim } from './mesher';

interface Job {
  id: number;
  prims: Prim[];
  boneCount: number;
  voxel: number;
  opts: MeshRegion;
}

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, prims, boneCount, voxel, opts } = ev.data;
  try {
    const m = meshPrims(prims, boneCount, voxel, opts);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, mesh: m }, [
      m.position.buffer,
      m.normal.buffer,
      m.color.buffer,
      m.rough.buffer,
      m.detail.buffer,
      m.emissive.buffer,
      m.skinIndex.buffer,
      m.skinWeight.buffer,
      m.index.buffer,
    ]);
  } catch (e) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: String(e) });
  }
};
