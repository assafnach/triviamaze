// Dev aid: contact sheet of every model's base-colour texture (to spot off-setting details).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const tiles = [];
for (const f of readdirSync('public/assets/models')) {
  const doc = await io.read(`public/assets/models/${f}`);
  const tex = doc.getRoot().listMaterials()[0]?.getBaseColorTexture();
  if (!tex) continue;
  const png = await sharp(Buffer.from(tex.getImage())).resize(200, 200).png().toBuffer();
  tiles.push({ name: f.replace('.glb', ''), png });
}
const cols = 6;
const comps = [];
tiles.forEach((t, i) => {
  const x = (i % cols) * 200;
  const y = Math.floor(i / cols) * 220;
  comps.push({ input: t.png, left: x, top: y + 20 });
  comps.push({ input: Buffer.from(`<svg width="200" height="20"><rect width="100%" height="100%" fill="#000"/><text x="3" y="14" font-size="12" fill="#fff" font-family="sans-serif">${t.name}</text></svg>`), left: x, top: y });
});
await sharp({ create: { width: cols * 200, height: Math.ceil(tiles.length / cols) * 220, channels: 3, background: '#222' } }).composite(comps).png().toFile('scripts/screenshots/out/props-albedo.png');
console.log(tiles.length, 'models');
