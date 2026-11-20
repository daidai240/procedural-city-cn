// Performance baseline: first interactive time, draw calls, triangles, FPS.
//
// Headless Chromium uses SwiftShader (software WebGL2), so the FPS number is a
// lower bound, not the real-GPU framerate. Draw calls and triangle counts are
// GPU independent and are the useful budget metrics.

import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const outFile = process.env.OUT_FILE || 'BASELINE-PERF.json';
const ids = ['chongqing', 'lujiazui', 'xian', 'shenzhen', 'jiangnan'];
const failOnConsoleError = process.env.ALLOW_ERRORS !== '1';

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

const report = { url: baseUrl, viewport: '1440x900', renderer: 'headless chromium / SwiftShader', cities: {}, errors: [] };

for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

  const t0 = Date.now();
  await page.goto(`${baseUrl}#style=${id}&seed=20261119`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(2200);

  const metrics = await page.evaluate(async () => {
    const city = window.__CITY__;
    const info = city.renderer.info;
    // Post-processing resets renderer.info per pass; sample a full frame with
    // autoReset off to record the real draw-call / triangle budget.
    info.autoReset = false;
    info.reset();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const calls = info.render.calls;
    const triangles = info.render.triangles;
    const points = info.render.points;
    info.autoReset = true;
    // Count rAF callbacks over a 3 s window to estimate framerate.
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        frames++;
        if (performance.now() - start < 3000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const seconds = (performance.now() - start) / 1000;
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      fps: frames / seconds,
      calls,
      triangles,
      points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? null,
      buildings: city.stats.buildings,
      readyAt: performance.now(),
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
    };
  });

  report.cities[id] = { readyMs, ...metrics, errors };
  report.errors.push(...errors);
  console.log(id, JSON.stringify(report.cities[id]));
  await page.close();
}

fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`wrote ${outFile}`);
await browser.close();
if (failOnConsoleError && report.errors.length) process.exit(1);
