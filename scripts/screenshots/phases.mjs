// Development helper: logs phase transitions and timing from "start game" to PLAYING.
import { chromium } from 'playwright';
const theme = process.env.THEME ?? 'ruins';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.text().startsWith('[build]') || m.type() === 'error') console.log(((Date.now() - t0) / 1000).toFixed(1), m.type(), m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
let t0 = Date.now();
await page.goto(`http://localhost:5199/?theme=${theme}&seed=424242${process.env.EXTRA ?? ''}`);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true, quality: 'high' })); });
await page.reload();
t0 = Date.now();
await page.waitForTimeout(Number(process.env.WAIT ?? 3000));
await page.getByRole('button', { name: 'התחל משחק' }).click();
await page.locator('.age-card').nth(4).click();
await page.getByRole('button', { name: /היכנס למבוך/ }).click();
console.log(((Date.now() - t0) / 1000).toFixed(1), 'clicked');
let last = '';
while (Date.now() - t0 < 240000) {
  const p = await page.evaluate(() => `${window.__tm?.state().phase} fps=${window.__tm?.controller.engine?.fps} load=${JSON.stringify(window.__tm?.controller && document.querySelector('.loading-bar, [role=progressbar]')?.getAttribute('aria-valuenow'))}`);
  if (p.split(' ')[0] !== last.split(' ')[0]) console.log(((Date.now() - t0) / 1000).toFixed(1), p);
  last = p;
  if (p.startsWith('PLAYING')) break;
  await page.waitForTimeout(250);
}
await browser.close();
