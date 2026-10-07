// Builds a labelled contact sheet of the downloaded material albedos (dev aid).
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const dir = 'public/assets/textures';
const names = readdirSync(dir);
const tile = 256;
const cols = 5;
const rows = Math.ceil(names.length / cols);
const composites = [];
for (const [i, n] of names.entries()) {
  const buf = await sharp(`${dir}/${n}/diff.webp`).resize(tile, tile).png().toBuffer();
  const x = (i % cols) * tile;
  const y = Math.floor(i / cols) * (tile + 24);
  composites.push({ input: buf, left: x, top: y + 24 });
  const svg = `<svg width="${tile}" height="24"><rect width="100%" height="100%" fill="#000"/><text x="4" y="17" font-size="15" fill="#fff" font-family="sans-serif">${n}</text></svg>`;
  composites.push({ input: Buffer.from(svg), left: x, top: y });
}
await sharp({ create: { width: cols * tile, height: rows * (tile + 24), channels: 3, background: '#222' } })
  .composite(composites)
  .png()
  .toFile('scripts/screenshots/out/materials.png');
console.log('ok');
