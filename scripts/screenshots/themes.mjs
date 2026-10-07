// Development helper: one quick run per theme → screenshots + FPS.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'scripts/screenshots/out';
mkdirSync(OUT, { recursive: true });
const themes = (process.env.THEMES ?? 'ruins,crystal,forest,temple,volcanic,frozen,mystic,castle').split(',');
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const phase = () => page.evaluate(() => window.__tm?.state().phase);
const waitPhase = async (p, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await phase()) === p) return;
    await wait(200);
  }
  throw new Error(`timeout ${p} (at ${await phase()})`);
};

for (const theme of themes) {
  await page.goto(`http://localhost:5199/?theme=${theme}`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true }));
  });
  await page.reload();
  await wait(4000);
  if (theme === themes[0]) await page.screenshot({ path: `${OUT}/theme-title-${theme}.png` });
  await page.getByRole('button', { name: 'התחל משחק' }).click();
  await page.locator('.age-card').nth(4).click();
  await page.getByRole('button', { name: /היכנס למבוך/ }).click();
  await waitPhase('PLAYING', 90000);
  await wait(2500);
  await page.screenshot({ path: `${OUT}/theme-${theme}-start.png` });
  const fps1 = await page.evaluate(() => window.__tm.controller.engine.fps);
  await page.evaluate(() => window.__tm.teleportToEncounter(0));
  await page.keyboard.down('KeyW');
  let p = await phase();
  for (let i = 0; i < 40 && p === 'PLAYING'; i++) {
    await wait(150);
    p = await phase();
  }
  await page.keyboard.up('KeyW');
  await waitPhase('QUESTION_ACTIVE', 15000);
  await wait(800);
  await page.screenshot({ path: `${OUT}/theme-${theme}-question.png` });
  await page.evaluate(() => window.__tm.answerCorrect());
  await wait(1200);
  await page.locator('.result-continue').click();
  await wait(2200);
  await page.screenshot({ path: `${OUT}/theme-${theme}-hint.png` });
  const fps2 = await page.evaluate(() => window.__tm.controller.engine.fps);
  const info = await page.evaluate(() => ({ q: window.__tm.quality(), enc: window.__tm.encounters()?.[0] }));
  console.log(theme, 'fps', fps1, fps2, JSON.stringify(info));
}
console.log('errors:', errors.join('\n'));
await browser.close();
