// Development helper: lists the shader programs a run compiles (to keep variant count down).
import { chromium } from 'playwright';
const theme = process.env.THEME ?? 'ruins';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:5199/?theme=${theme}&seed=424242`);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true, quality: 'high' })); });
await page.reload();
await page.waitForTimeout(4000);
await page.getByRole('button', { name: 'התחל משחק' }).click();
await page.locator('.age-card').nth(4).click();
await page.getByRole('button', { name: /היכנס למבוך/ }).click();
await page.waitForFunction(() => window.__tm?.state().phase === 'PLAYING', null, { timeout: 180000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const r = window.__tm.controller.engine.renderer;
  const out = {};
  for (const p of r.info.programs) {
    const k = p.cacheKey.split(',');
    const key = (p.name || '?') + ' ' + k[0] + (k.includes('true') ? '' : '');
    out[key] = (out[key] ?? 0) + 1;
  }
  return { total: r.info.programs.length, groups: out, textures: r.info.memory.textures, geometries: r.info.memory.geometries };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
