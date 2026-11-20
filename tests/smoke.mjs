import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.env.SHOT_DIR || 'docs/screenshots/final';
fs.mkdirSync(outDir, { recursive: true });

let server = null;
let baseUrl = process.env.URL;
if (!baseUrl) {
  const port = 5199;
  server = spawn(process.execPath, ['tests/serve.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) break;
    } catch {
      // server booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const errors = [];
const checks = [];
const failures = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures.push(name);
}

function analyze(png) {
  const { width: w, height: h, data } = png;
  const cropRight = 430;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w - cropRight; x += 4) {
      const i = (w * y + x) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum;
      sum2 += lum * lum;
      n++;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { mean, std };
}

function meanDiff(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w - 430; x += 4) {
      const i = (a.width * y + x) * 4;
      const j = (b.width * y + x) * 4;
      sum += Math.abs(a.data[i] - b.data[j]) +
        Math.abs(a.data[i + 1] - b.data[j + 1]) +
        Math.abs(a.data[i + 2] - b.data[j + 2]);
      n += 3;
    }
  }
  return sum / n;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

const started = Date.now();
await page.goto(baseUrl, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
await page.waitForTimeout(2600);

const ids = ['chongqing', 'lujiazui', 'xian', 'shenzhen', 'jiangnan'];
const shots = {};
const stats = {};

for (const id of ids) {
  if (id !== 'chongqing') {
    await page.click(`.preset[data-style="${id}"]`);
    await page.waitForFunction((target) => window.__CITY__?.style.id === target, id, { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.waitForFunction(() => window.__CITY__?.camTween && !window.__CITY__.camTween.active, { timeout: 30000 });
    await page.waitForTimeout(900);
  }
  const info = await page.evaluate(() => ({
    style: window.__CITY__.style.id,
    buildings: window.__CITY__.stats.buildings,
    roofDetails: window.__CITY__.stats.roofDetails ?? 0,
    terrainSegments: window.__CITY__.ctx.terrainSegments ?? 0,
    labels: window.__CITY__.ctx.labels.length,
    pattern: window.__CITY__.state.pattern,
  }));
  const buf = await page.screenshot({ path: path.join(outDir, `${id}.png`) });
  const png = PNG.sync.read(buf);
  const s = analyze(png);
  stats[id] = { ...info, ...s };
  shots[id] = png;
  check(`${id}: non-blank canvas`, s.mean > 7 && s.std > 5, s);
  check(`${id}: has buildings`, info.buildings > 40, info.buildings);
  check(`${id}: has landmark labels`, info.labels >= 3, info.labels);
  check(`${id}: style id`, info.style === id, info.style);
  if (id === 'chongqing' || id === 'lujiazui' || id === 'shenzhen') {
    check(`${id}: rooftop structure detail`, info.roofDetails > 40, info.roofDetails);
  }
  if (id === 'chongqing') {
    check('chongqing: terrain mesh refined', info.terrainSegments >= 300, info.terrainSegments);
  }
}

for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const d = meanDiff(shots[ids[i]], shots[ids[j]]);
    check(`visual difference ${ids[i]} vs ${ids[j]}`, d > 6, Math.round(d * 10) / 10);
  }
}

const fpsText = await page.locator('#stat-fps').textContent();
const fps = Number.parseInt(fpsText || '0', 10);
check('headless framerate', fps >= 5, fps);

// ------- live parameter response (Chongqing) -------
await page.click('.preset[data-style="chongqing"]');
await page.waitForFunction(() => window.__CITY__?.style.id === 'chongqing', null, { timeout: 30000 });
await page.waitForTimeout(2400);
await page.evaluate(() => {
  const el = document.getElementById('ctrl-density');
  el.value = '0.3';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(1700);
const lowDensity = await page.evaluate(() => ({
  buildings: window.__CITY__.stats.buildings,
  seed: window.__CITY__.state.seed,
}));
const lowBuf = await page.screenshot();
const lowPng = PNG.sync.read(lowBuf);
check(
  'density slider rebuilds city',
  lowDensity.buildings !== stats.chongqing.buildings,
  { before: stats.chongqing.buildings, after: lowDensity.buildings }
);
check('density change visible', meanDiff(lowPng, shots.chongqing) > 1.2, meanDiff(lowPng, shots.chongqing));

await page.evaluate(() => {
  const el = document.getElementById('ctrl-density');
  el.value = '0.9';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const time = document.getElementById('ctrl-time');
  time.value = '0.12';
  time.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(1400);
const dayBuf = await page.screenshot({ path: path.join(outDir, 'chongqing-day.png') });
const dayPng = PNG.sync.read(dayBuf);
const dayStats = analyze(dayPng);
check(
  'time-of-day slider changes lighting',
  Math.abs(dayStats.mean - stats.chongqing.mean) > 3,
  { night: Math.round(stats.chongqing.mean), day: Math.round(dayStats.mean) }
);

// ------- camera views -------
const beforeCam = await page.evaluate(() => window.__CITY__.camera.position.toArray());
await page.click('#view-row .view-btn:nth-child(2)');
await page.waitForTimeout(2000);
const afterCam = await page.evaluate(() => window.__CITY__.camera.position.toArray());
const camDelta = Math.hypot(...beforeCam.map((v, i) => v - afterCam[i]));
check('camera preset flies to new view', camDelta > 5, Math.round(camDelta));

// ------- seed reproducibility -------
const seedA = await page.evaluate(() => {
  const c = window.__CITY__;
  c.setState({ seed: 424242 });
  return c.stats.buildings;
});
await page.waitForTimeout(900);
const seedB = await page.evaluate(() => {
  const c = window.__CITY__;
  c.setState({ seed: 424242 });
  return c.stats.buildings;
});
check('deterministic seed produces same building count', seedA === seedB, { seedA, seedB });

const finalErrors = [...errors];
check('no console/page errors', finalErrors.length === 0, finalErrors.slice(0, 5));

const summary = {
  url: baseUrl,
  durationMs: Date.now() - started,
  stats,
  checks,
  failures,
  errors: finalErrors,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ failures, stats, errors: finalErrors.slice(0, 5), durationMs: summary.durationMs }, null, 2));
console.log(`${checks.length - failures.length}/${checks.length} checks passed`);

await browser.close();
if (server) server.kill();
if (failures.length) process.exit(1);
