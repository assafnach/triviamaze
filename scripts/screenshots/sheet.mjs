// Dev aid: tiles several screenshots into one image (PATTERN = substring of file names).
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const dir = 'scripts/screenshots/out';
const pattern = process.env.PATTERN ?? 'world-';
const files = readdirSync(dir).filter((f) => f.includes(pattern) && f.endsWith('.png') && !f.startsWith('sheet')).sort();
const w = 640;
const h = 360;
const cols = 2;
const rows = Math.ceil(files.length / cols);
const comps = [];
for (const [i, f] of files.entries()) {
  const buf = await sharp(`${dir}/${f}`).resize(w, h, { fit: 'contain', background: '#111' }).png().toBuffer();
  comps.push({ input: buf, left: (i % cols) * w, top: Math.floor(i / cols) * (h + 22) + 22 });
  comps.push({ input: Buffer.from(`<svg width="${w}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="14" fill="#fff" font-family="sans-serif">${f}</text></svg>`), left: (i % cols) * w, top: Math.floor(i / cols) * (h + 22) });
}
await sharp({ create: { width: cols * w, height: rows * (h + 22), channels: 3, background: '#111' } }).composite(comps).png().toFile(`${dir}/sheet-${pattern.replace(/[^a-z0-9-]/gi, '')}.png`);
console.log(files.length, 'tiles');
