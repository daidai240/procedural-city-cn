// Realism-review capture harness.
//
// Captures a fixed set of city scenes from a running copy of the app so that
// "before" and "after" revisions can be compared without changing the camera,
// viewport, time-of-day or UI state by hand.
//
// Usage:
//   BASE_URL=http://127.0.0.1:5181/ OUT_DIR=shots/before \
//     SCENES=tests/scenes/baseline.json node tests/realism-shots.mjs
//
// Every scene opens a fresh page and waits for window.__CITY_READY__, then
// applies the requested camera / view / UI state before the screenshot.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const outDir = process.env.OUT_DIR || 'shots/before';
const sceneFile = process.env.SCENES || 'tests/scenes/baseline.json';
const viewport = {
  width: Number(process.env.SHOT_W || 1440),
  height: Number(process.env.SHOT_H || 900),
};
const settleMs = Number(process.env.SETTLE_MS || 1500);

const scenes = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

const results = [];
for (const scene of scenes) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

  const params = new URLSearchParams();
  params.set('style', scene.style);
  params.set('seed', String(scene.seed ?? 20261119));
  if (scene.time !== null && scene.time !== undefined) {
    params.set('time', String(scene.time));
  }
  if (scene.hash) {
    for (const [k, v] of Object.entries(scene.hash)) params.set(k, String(v));
  }

  const started = Date.now();
  await page.goto(`${baseUrl}#${params.toString()}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
  await page.waitForTimeout(settleMs);

  if (scene.panel === 'closed') {
    await page.click('#panel-close');
    await page.waitForTimeout(250);
  }
  if (scene.labels === false) {
    await page.evaluate(() => {
      const el = document.getElementById('labels');
      if (el) el.style.display = 'none';
    });
  }

  const view = scene.view ?? 0;
  if (view > 0) {
    await page.click(`#view-row .view-btn:nth-child(${view + 1})`);
    await page.waitForTimeout(350);
    await page.waitForFunction(() => !window.__CITY__?.camTween?.active, { timeout: 30000 });
    await page.waitForTimeout(500);
  }

  if (scene.camera) {
    await page.evaluate((cam) => {
      const city = window.__CITY__;
      city.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      city.controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
      city.controls.update();
    }, scene.camera);
    await page.waitForTimeout(450);
  }

  if (scene.hideBuildings) {
    await page.evaluate(() => {
      window.__CITY__.ctx.world.traverse((o) => {
        if (o.isInstancedMesh) o.visible = false;
      });
    });
    await page.waitForTimeout(350);
  }

  if (scene.trainT !== undefined) {
    await page.evaluate((t) => {
      if (window.__CITY__.ctx && window.__CITY__.ctx.trainState) {
        window.__CITY__.ctx.trainState.t = t;
      }
    }, scene.trainT);
    await page.waitForTimeout(150);
  }

  const info = await page.evaluate(async () => {
    const city = window.__CITY__;
    const r = city?.renderer;
    // Post-processing resets renderer.info on every pass, so the last pass
    // would report 1 draw call. Disable autoReset, reset once, then sample a
    // full frame to get the real scene budget.
    let calls = null;
    let triangles = null;
    if (r) {
      r.info.autoReset = false;
      r.info.reset();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      calls = r.info.render.calls;
      triangles = r.info.render.triangles;
      r.info.autoReset = true;
    }
    return {
      style: city?.style?.id,
      time: city?.state?.time,
      buildings: city?.stats?.buildings,
      labels: city?.ctx?.labels?.length,
      calls,
      triangles,
      fps: document.getElementById('stat-fps')?.textContent,
    };
  });

  const file = path.join(outDir, `${scene.name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  results.push({ name: scene.name, file, durationMs: Date.now() - started, info, errors });
  console.log(`${scene.name}  ${JSON.stringify(info)}  errors=${errors.length}`);
  await page.close();
}

fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(results, null, 2));
await browser.close();

const failed = results.filter((r) => r.errors.length);
if (failed.length) {
  console.error('console errors in', failed.map((f) => f.name));
  process.exit(1);
}
