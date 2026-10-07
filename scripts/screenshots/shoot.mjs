// Development helper: drives the game in a real browser and saves screenshots.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5199/';
const OUT = process.env.OUT ?? 'scripts/screenshots/out';
const VIEW = process.env.VIEW ?? 'desktop';
mkdirSync(OUT, { recursive: true });

const viewports = {
  desktop: { width: 1366, height: 768, isMobile: false, hasTouch: false },
  phone: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  portrait: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const vp = viewports[VIEW];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${VIEW}-${name}.png` });
  console.log('shot', name);
};
const wait = (ms) => page.waitForTimeout(ms);
const phase = () => page.evaluate(() => window.__tm?.state().phase);
const waitPhase = async (p, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await phase()) === p) return true;
    await wait(250);
  }
  throw new Error(`timeout waiting for ${p}, at ${await phase()}`);
};

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(9000);
await shot('01-title');

await page.getByRole('button', { name: 'התחל משחק' }).click();
await wait(600);
await shot('02-age');
await page.locator('.age-card').nth(1).click();
await wait(500);
await page.locator('.text-input').fill('אביר הלילה');
await shot('03-setup');
await page.getByRole('button', { name: 'הצג לי הדרכה קצרה' }).click();
await wait(500);
await shot('04-tutorial-1');
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'הבא' }).click();
  await wait(300);
}
await shot('05-tutorial-3');
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'הבא' }).click();
  await wait(300);
}
await page.getByRole('button', { name: /אני מוכן/ }).click();
await wait(400);
await shot('06-loading');
await waitPhase('INTRO_CINEMATIC', 90000);
await wait(1500);
await shot('07-intro');
await waitPhase('PLAYING', 20000);
await wait(1500);
await shot('08-playing');

// Walk forward a bit.
await page.keyboard.down('KeyW');
await wait(1500);
await page.keyboard.up('KeyW');
await shot('09-walked');

// First creature: correct answer.
await page.evaluate(() => window.__tm.teleportToEncounter(0));
await wait(200);
await page.keyboard.down('KeyW');
let p = await phase();
for (let i = 0; i < 40 && p === 'PLAYING'; i++) {
  await wait(150);
  p = await phase();
}
await page.keyboard.up('KeyW');
await wait(900);
await shot('10-encounter-greet');
await waitPhase('QUESTION_ACTIVE', 15000);
await wait(700);
await shot('11-question');
await page.evaluate(() => window.__tm.answerCorrect());
await wait(2600);
await shot('12-correct-result');
await page.locator('.result-continue').click();
await wait(1800);
await shot('13-route-hint');

// Second creature: wrong answer.
await page.evaluate(() => window.__tm.teleportToEncounter(1));
await page.keyboard.down('KeyW');
p = await phase();
for (let i = 0; i < 40 && (p === 'PLAYING' || p === 'ROUTE_HINT'); i++) {
  await wait(150);
  p = await phase();
}
await page.keyboard.up('KeyW');
await waitPhase('QUESTION_ACTIVE', 15000);
await wait(500);
await page.evaluate(() => window.__tm.answerWrong());
await wait(2500);
await shot('14-wrong-result');
await page.locator('.result-continue').click();
await wait(800);
const afterWrong = await phase();
console.log('phase after wrong:', afterWrong);
// The player must be free to move after a wrong answer.
const before = await page.evaluate(() => window.__tm.player());
await page.keyboard.down('KeyS');
await wait(800);
await page.keyboard.up('KeyS');
const after = await page.evaluate(() => window.__tm.player());
console.log('moved after wrong:', Math.hypot(after.x - before.x, after.z - before.z).toFixed(2));
await shot('15-free-after-wrong');

// Map.
await page.keyboard.press('KeyM');
await wait(600);
await shot('16-map');
await page.keyboard.press('KeyM');

// Timer urgency.
await page.evaluate(() => window.__tm.setTime(25));
await wait(1200);
await shot('17-urgent');
await page.evaluate(() => window.__tm.resetTimer());

// Life lost.
await page.evaluate(() => window.__tm.expireTimer());
await wait(1500);
await shot('18-life-lost');
await waitPhase('PLAYING', 15000);
const hud = await page.evaluate(() => window.__tm.state().hud);
console.log('after life lost hud:', JSON.stringify(hud));

// Victory.
await page.evaluate(() => window.__tm.teleportToExit());
await page.keyboard.down('KeyW');
p = await phase();
for (let i = 0; i < 60 && p !== 'VICTORY'; i++) {
  await wait(150);
  p = await phase();
}
await page.keyboard.up('KeyW');
await wait(1600);
await shot('19-victory');
await waitPhase('SCORE_SUMMARY', 15000);
await wait(1200);
await shot('20-summary');
await page.getByRole('button', { name: 'שמירה בטבלת המובילים' }).click();
await wait(800);
await shot('21-summary-saved');
await page.getByRole('button', { name: 'טבלת המובילים' }).click();
await wait(800);
await shot('22-leaderboard');

console.log('\nCONSOLE ERRORS/WARNINGS:');
for (const e of errors) console.log(e);
await browser.close();
