// Development helper: visual review of the environment overhaul for one biome pair.
// THEME=ruins THEME2=forest SEED=1234 QUALITY=high node scripts/screenshots/world.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'scripts/screenshots/out';
mkdirSync(OUT, { recursive: true });
const theme = process.env.THEME ?? 'ruins';
const theme2 = process.env.THEME2 ?? '';
const seed = process.env.SEED ?? '424242';
const quality = process.env.QUALITY ?? 'high';
const shots = (process.env.SHOTS ?? 'start,encounter,room,biome').split(',');
const tag = `${theme}${theme2 ? '-' + theme2 : ''}`;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const phase = () => page.evaluate(() => window.__tm?.state().phase);
const waitPhase = async (p, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await phase()) === p) return;
    await wait(250);
  }
  throw new Error(`timeout ${p} (at ${await phase()})`);
};

await page.goto(`http://localhost:5199/?theme=${theme}${theme2 ? `&theme2=${theme2}` : ''}&seed=${seed}`);
await page.evaluate((q) => {
  localStorage.clear();
  localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true, quality: q }));
}, quality);
await page.reload();
await wait(3000);
const t0 = Date.now();
await page.getByRole('button', { name: 'התחל משחק' }).click();
await page.locator('.age-card').nth(4).click();
await page.getByRole('button', { name: /היכנס למבוך/ }).click();
await waitPhase('PLAYING', 180000);
console.log('load ms', Date.now() - t0);
await wait(2500);
if (shots.includes('start')) {
  await page.screenshot({ path: `${OUT}/world-${tag}-start.png` });
  console.log('fps start', await page.evaluate(() => window.__tm.controller.engine.fps));
}
if (shots.includes('room')) {
  const rooms = await page.evaluate(() => window.__tm.rooms()?.length ?? 0);
  for (let i = 0; i < rooms; i++) {
    await page.evaluate((i) => window.__tm.teleportToRoom(i), i);
    await wait(2200);
    await page.screenshot({ path: `${OUT}/world-${tag}-room${i}.png` });
  }
}
if (shots.includes('biome')) {
  // Walk the true route: shots at 30%, 52% and 80% of the way.
  for (const f of [0.3, 0.52, 0.8]) {
    const pos = await page.evaluate((f) => {
      const m = window.__tm.maze();
      const C = 4;
      const i = Math.floor(m.solution.length * f);
      const a = m.solution[i];
      const b = m.solution[Math.min(m.solution.length - 1, i + 1)];
      const ax = (a % m.width) * C + 2;
      const az = Math.floor(a / m.width) * C + 2;
      const bx = (b % m.width) * C + 2;
      const bz = Math.floor(b / m.width) * C + 2;
      return { x: ax, z: az, yaw: Math.atan2(-(bx - ax), -(bz - az)) };
    }, f);
    await page.evaluate((p) => window.__tm.teleport(p.x, p.z, p.yaw), pos);
    await wait(3500);
    await page.screenshot({ path: `${OUT}/world-${tag}-route${Math.round(f * 100)}.png` });
  }
}
if (shots.includes('encounter')) {
  await page.evaluate(() => window.__tm.teleportToEncounter(0));
  await wait(400);
  await page.keyboard.down('KeyW');
  let p = await phase();
  for (let i = 0; i < 40 && p === 'PLAYING'; i++) {
    await wait(150);
    p = await phase();
  }
  await page.keyboard.up('KeyW');
  await wait(1500);
  await page.screenshot({ path: `${OUT}/world-${tag}-encounter.png` });
  console.log('encounter', JSON.stringify(await page.evaluate(() => window.__tm.encounters()?.[0])));
  try {
    await waitPhase('QUESTION_ACTIVE', 15000);
    await page.evaluate(() => window.__tm.answerCorrect());
    await wait(1200);
    await page.locator('.result-continue').click();
    await wait(2600);
    await page.screenshot({ path: `${OUT}/world-${tag}-hint.png` });
  } catch (e) {
    console.log('question flow:', e.message);
  }
  console.log('fps', await page.evaluate(() => window.__tm.controller.engine.fps));
}
console.log('errors:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
