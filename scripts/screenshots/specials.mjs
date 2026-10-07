import { chromium } from 'playwright';
const OUT = 'scripts/screenshots/out';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => window.__tm?.state());
const waitPhase = async (p, timeout = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if ((await st())?.phase === p) return; await wait(200); } throw new Error('timeout ' + p); };
for (const [kind, seed] of [['oracle', 1], ['merchant', 6]]) {
  await page.goto(`http://localhost:5199/?seed=${seed}`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tm.settings.v1', JSON.stringify({ tutorialSeen: true })); });
  await page.reload();
  await wait(2500);
  await page.getByRole('button', { name: 'התחל משחק' }).click();
  await page.locator('.age-card').nth(0).click();
  await page.getByRole('button', { name: /היכנס למבוך/ }).click();
  await waitPhase('PLAYING');
  if (kind === 'merchant') {
    // Give the player two treasures so the trade is possible.
    await page.evaluate(() => { const s = window.__tm.controller.run.session; const t = window.__tm.maze().treasures; s.collectTreasure(t[0]); s.collectTreasure(t[1]); window.__tm.setTime(300); });
  }
  await page.evaluate(() => window.__tm.teleportToSpecial());
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 40 && (await st()).phase === 'PLAYING'; i++) await wait(150);
  await page.keyboard.up('KeyW');
  await waitPhase('SPECIAL_ENCOUNTER', 10000);
  await wait(900);
  await page.screenshot({ path: `${OUT}/special-${kind}.png` });
  const before = await st();
  await page.getByRole('button', { name: /אני מסכים/ }).click();
  await wait(1200);
  await page.screenshot({ path: `${OUT}/special-${kind}-accepted.png` });
  const after = await st();
  console.log(kind, 'score', before.hud.score, '->', after.hud.score, 'time', before.hud.timeLeft.toFixed(1), '->', after.hud.timeLeft.toFixed(1), 'treasures', before.hud.treasures, '->', after.hud.treasures);
  await page.getByRole('button', { name: /המשך בדרך/ }).click();
  await wait(300);
  if (kind === 'oracle') { await page.screenshot({ path: `${OUT}/special-oracle-map.png` }); await page.keyboard.press('KeyM'); }
  await wait(400);
  console.log(kind, 'phase after continue', (await st()).phase, 'exitKnown', await page.evaluate(() => window.__tm.controller.run.exitDiscovered));
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
