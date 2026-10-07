// Development helper: renders sculpted creatures in the turntable preview.
// NAME=wizard,elf VIEWS=front,face MOOD=happy node scripts/screenshots/creature.mjs
import { chromium } from 'playwright';
const names = (process.env.NAME ?? 'goblin').split(',');
const views = (process.env.VIEWS ?? 'front,close,side').split(',');
const mood = process.env.MOOD ?? '';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
for (const name of names) {
  for (const v of views) {
    await page.goto(`http://localhost:5199/?preview=${name}&view=${v}${mood ? `&mood=${mood}` : ''}`);
    await page.waitForFunction(() => window.__preview?.ready, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `scripts/screenshots/out/creature-${name}-${v}${mood ? '-' + mood : ''}.png` });
    if (v === views[0]) console.log(name, JSON.stringify(await page.evaluate(() => window.__preview)));
  }
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
