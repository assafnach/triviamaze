// Development helper: photographs every creature of a run in place (HUD hidden).
// THEME=ruins THEME2=forest SEED=424242 node scripts/screenshots/cast.mjs
import { chromium } from 'playwright';
const OUT = 'scripts/screenshots/out';
const theme = process.env.THEME ?? 'ruins';
const theme2 = process.env.THEME2 ?? '';
const seed = process.env.SEED ?? '424242';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(`http://localhost:5199/?theme=${theme}${theme2 ? `&theme2=${theme2}` : ''}&seed=${seed}`);
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true, quality: 'high' }));
});
await page.reload();
await wait(3000);
await page.getByRole('button', { name: 'התחל משחק' }).click();
await page.locator('.age-card').nth(4).click();
await page.getByRole('button', { name: /היכנס למבוך/ }).click();
await page.waitForFunction(() => window.__tm?.state().phase === 'PLAYING', null, { timeout: 180000 });
const cast = await page.evaluate(() => window.__tm.castReady());
console.log('cast', JSON.stringify(cast));
await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
for (let i = 0; i < cast.length; i++) {
  const id = await page.evaluate((i) => window.__tm.frameEncounter(i, 2.8), i);
  await wait(1800);
  await page.screenshot({ path: `${OUT}/cast-${theme}-${i}-${id}.png` });
}
await browser.close();
