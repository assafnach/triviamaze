// Dev aid: prints the material setup of each GLB (which maps, alpha mode).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readdirSync } from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of readdirSync('public/assets/models')) {
  const doc = await io.read(`public/assets/models/${f}`);
  for (const m of doc.getRoot().listMaterials()) {
    const maps = [m.getBaseColorTexture() && 'base', m.getNormalTexture() && 'nor', m.getMetallicRoughnessTexture() && 'mr', m.getOcclusionTexture() && 'ao', m.getEmissiveTexture() && 'em'].filter(Boolean).join('+');
    const sameORM = m.getOcclusionTexture() && m.getOcclusionTexture() === m.getMetallicRoughnessTexture();
    const exts = m.listExtensions().map((e) => e.extensionName).join(',');
    console.log(f.padEnd(32), m.getName().padEnd(34), maps.padEnd(18), m.getAlphaMode(), m.getDoubleSided() ? 'double' : '', sameORM ? 'ORM' : '', exts);
  }
}
