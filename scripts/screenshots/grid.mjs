// Dev aid: one image from an explicit list of screenshots (FILES = comma-separated names in out/).
import sharp from 'sharp';
const dir = 'scripts/screenshots/out';
const files = (process.env.FILES ?? '').split(',').filter(Boolean);
const size = Number(process.env.SIZE ?? 420);
const cols = Number(process.env.COLS ?? 3);
const rows = Math.ceil(files.length / cols);
const comps = [];
for (const [i, f] of files.entries()) {
  const buf = await sharp(`${dir}/${f}`).resize(size, size, { fit: 'contain', background: '#111' }).png().toBuffer();
  comps.push({ input: buf, left: (i % cols) * size, top: Math.floor(i / cols) * size });
}
await sharp({ create: { width: cols * size, height: rows * size, channels: 3, background: '#111' } }).composite(comps).png().toFile(`${dir}/${process.env.OUTNAME ?? 'grid'}.png`);
console.log('ok');
