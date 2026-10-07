import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';
import { readdirSync, statSync } from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const dir = 'public/assets/models';
for (const f of readdirSync(dir)) {
  const doc = await io.read(`${dir}/${f}`);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2));
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  console.log(f.padEnd(34), 'size', size.join(' x '), 'min', b.min.map((v) => v.toFixed(2)).join(','), 'meshes', root.listMeshes().length, 'mats', root.listMaterials().length, 'tris', Math.round(tris), 'KB', Math.round(statSync(`${dir}/${f}`).size / 1024));
}
