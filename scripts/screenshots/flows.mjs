// Development helper: verifies critical flows in a real browser (game over, resume, settings, pause).
import { chromium } from 'playwright';

const OUT = 'scripts/screenshots/out';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => window.__tm?.state());
const phase = async () => (await st())?.phase;
const waitPhase = async (p, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await phase()) === p) return;
    await wait(200);
  }
  throw new Error(`timeout ${p} (at ${await phase()})`);
};
const check = (label, cond) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);

await page.goto('http://localhost:5199/');
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true }));
});
await page.reload();
await wait(3000);
await page.getByRole('button', { name: 'התחל משחק' }).click();
await page.locator('.age-card').nth(0).click();
await page.getByRole('button', { name: /היכנס למבוך/ }).click();
await waitPhase('PLAYING', 180000);

// ── Timer expiry ×3 → exactly one life each time, reset to 10:00, then game over ──
for (let i = 1; i <= 3; i++) {
  await page.evaluate(() => window.__tm.expireTimer());
  await wait(600);
  const s = await st();
  check(`expiry ${i}: phase LIFE_LOST`, s.phase === 'LIFE_LOST');
  check(`expiry ${i}: lives = ${3 - i}`, s.hud.lives === 3 - i);
  if (i < 3) {
    await waitPhase('PLAYING', 15000);
    const s2 = await st();
    check(`expiry ${i}: timer reset to 10:00`, s2.hud.timeLeft > 599);
    check(`expiry ${i}: player back at checkpoint`, (await page.evaluate(() => window.__tm.player().cell)) === (await page.evaluate(() => window.__tm.controller.run.session.checkpoint.cell)));
  }
}
await waitPhase('GAME_OVER', 15000);
await wait(800);
await page.screenshot({ path: `${OUT}/flow-game-over.png` });
check('game over screen shows "נפסלת"', await page.getByText('נפסלת').first().isVisible());
check('game over offers "נסה שוב"', await page.getByRole('button', { name: 'נסה שוב' }).isVisible());
check('run snapshot cleared after game over', (await page.evaluate(() => localStorage.getItem('tm.run.v1'))) === null);

// ── Retry → new run; then refresh mid-run → resume prompt ──
await page.getByRole('button', { name: 'נסה שוב' }).click();
await waitPhase('PLAYING', 180000);
await page.keyboard.down('KeyW');
await wait(1200);
await page.keyboard.up('KeyW');
await page.evaluate(() => window.__tm.setTime(400));
await wait(4500); // autosave interval
const beforeReload = await page.evaluate(() => window.__tm.player());
await page.reload();
await wait(2500);
check('refresh shows resume prompt', (await phase()) === 'RESUME_PROMPT');
check('resume prompt text', await page.getByText('המשחק הקודם עדיין ממתין לך. להמשיך?').isVisible());
await page.screenshot({ path: `${OUT}/flow-resume.png` });
await page.getByRole('button', { name: 'המשך משחק' }).click();
await waitPhase('PLAYING', 180000);
const afterReload = await page.evaluate(() => window.__tm.player());
const s3 = await st();
check('resumed near saved position', Math.hypot(afterReload.x - beforeReload.x, afterReload.z - beforeReload.z) < 1.5);
check('resumed clock ≈ saved clock', s3.hud.timeLeft < 401 && s3.hud.timeLeft > 380);

// ── Pause, settings, reduced motion ──
await page.keyboard.press('Escape');
await wait(400);
check('Esc pauses', (await phase()) === 'PAUSED');
const t1 = (await st()).hud.timeLeft;
await wait(1500);
check('clock frozen while paused', Math.abs((await st()).hud.timeLeft - t1) < 0.01);
await page.getByRole('button', { name: 'הגדרות' }).click();
await wait(400);
await page.screenshot({ path: `${OUT}/flow-settings.png` });
await page.getByRole('switch', { name: /הפחתת תנועה/ }).check({ force: true });
await wait(200);
check('reduced motion class applied', await page.evaluate(() => document.documentElement.classList.contains('reduced-motion')));
check('reduced motion persisted', (await page.evaluate(() => JSON.parse(localStorage.getItem('tm.settings.v1')).reducedMotion)) === true);
await page.getByRole('button', { name: 'חזרה' }).click();
await wait(300);
check('settings returns to pause', (await phase()) === 'PAUSED');
await page.getByRole('button', { name: 'המשך לשחק' }).click();
await wait(300);
check('resume returns to play', (await phase()) === 'PLAYING');

// ── Special encounter, if this labyrinth has one ──
const special = await page.evaluate(() => window.__tm.maze().specials[0]);
console.log('special in this maze:', special ? special.kind : 'none');

console.log('\nerrors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
