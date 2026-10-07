import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5199/');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const c = window.__tm?.controller;
    const e = c?.engine;
    return { phase: window.__tm?.state().phase, q: e?.quality, fps: e?.fps, calls: e?.renderer.info.render.calls, tris: e?.renderer.info.render.triangles, gpu: (() => { const gl = e?.renderer.getContext(); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?'; })() };
  });
  console.log(JSON.stringify(info));
}
const t0 = Date.now();
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
console.log('2 frames ms', Date.now() - t0);
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
