// Dev aid: captures the mesher jobs of one species (for profiling the mesher in Node).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const name = process.env.NAME ?? 'golem';
const out = process.env.OUT ?? `jobs-${name}.json`;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.addInitScript(() => { window.__meshJobs = []; });
await page.goto(`http://localhost:5199/?preview=${name}&view=front`);
await page.waitForFunction(() => window.__preview?.ready, null, { timeout: 120000 });
writeFileSync(out, await page.evaluate(() => JSON.stringify(window.__meshJobs)));
console.log('saved', out);
await browser.close();
