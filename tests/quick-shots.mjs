// Fast iteration harness: one browser page per city, time changed through the
// real slider, camera/scene state applied directly. Used while tuning; final
// review evidence is captured with tests/realism-shots.mjs (fresh page per
// scene) so every comparison is independent.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5182/';
const outDir = process.env.OUT_DIR || 'shots/check';
const plan = process.env.PLAN_FILE
  ? JSON.parse(fs.readFileSync(process.env.PLAN_FILE, 'utf8'))
  : JSON.parse(process.env.PLAN || '{}');
const scenes = plan.scenes || [];
const style = plan.style || 'chongqing';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

const t0 = Date.now();
await page.goto(`${baseUrl}#style=${style}&seed=${plan.seed ?? 20261119}&time=${plan.time ?? 0.66}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
await page.waitForTimeout(1200);
console.log(`load ${Date.now() - t0}ms`);

const setTime = async (time) => {
  await page.evaluate((t) => {
    const el = document.getElementById('ctrl-time');
    el.value = String(t);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
  await page.waitForTimeout(700);
};

const setView = async (index) => {
  if (!index) return;
  await page.evaluate((i) => {
    const buttons = document.querySelectorAll('#view-row .view-btn');
    if (buttons[i]) buttons[i].click();
  }, index);
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !window.__CITY__?.camTween?.active, { timeout: 30000 });
  await page.waitForTimeout(350);
};

const setCamera = async (camera) => {
  await page.evaluate((cam) => {
    const city = window.__CITY__;
    city.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    city.controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    city.controls.update();
  }, camera);
  await page.waitForTimeout(350);
};

const setPanel = async (state) => {
  await page.evaluate((next) => {
    const panel = document.getElementById('panel');
    const open = document.getElementById('panel-open');
    if (next === 'closed') {
      panel.classList.add('hidden');
      open.hidden = false;
    } else {
      panel.classList.remove('hidden');
      open.hidden = true;
    }
  }, state);
  await page.waitForTimeout(200);
};

const setLabels = async (on) => {
  await page.evaluate((visible) => {
    const tg = document.getElementById('tg-labels');
    if (tg.checked !== visible) {
      tg.checked = visible;
      tg.dispatchEvent(new Event('change'));
    }
  }, on);
  await page.waitForTimeout(200);
};

const setBuildings = async (visible) => {
  await page.evaluate((v) => {
    window.__CITY__.ctx.world.traverse((o) => { if (o.isInstancedMesh) o.visible = v; });
  }, visible);
  await page.waitForTimeout(250);
};

for (const scene of scenes) {
  const started = Date.now();
  await setPanel(scene.panel ?? 'closed');
  await setLabels(scene.labels ?? false);
  if (scene.time !== undefined && scene.time !== null) await setTime(scene.time);
  await setView(scene.view ?? 0);
  if (scene.camera) await setCamera(scene.camera);
  await setBuildings(!scene.hideBuildings);
  if (scene.trainT !== undefined) {
    await page.evaluate((t) => {
      if (window.__CITY__.ctx && window.__CITY__.ctx.trainState) {
        window.__CITY__.ctx.trainState.t = t;
      }
    }, scene.trainT);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(450);
  const info = await page.evaluate(() => {
    const city = window.__CITY__;
    const r = city?.renderer?.info?.render;
    return { time: city?.state?.time, calls: r?.calls, triangles: r?.triangles, buildings: city?.stats?.buildings };
  });
  const file = path.join(outDir, `${scene.name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  console.log(`${scene.name} ${JSON.stringify(info)} ${Date.now() - started}ms`);
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
