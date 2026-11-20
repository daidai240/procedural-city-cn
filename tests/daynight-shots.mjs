// Capture the day / night mode button evidence on the Chongqing preset.
//
// Usage (from the repo root):
//   node tests/daynight-shots.mjs --root . --out docs/screenshots/daynight/after --mode after
//   node tests/daynight-shots.mjs --root ../baseline-main --out docs/screenshots/daynight/before --mode before
//
// `--root` is the checkout to serve. `--mode before` runs against a baseline
// checkout that predates the button and only captures the unchanged dusk view.

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = path.resolve(arg('root', '.'));
const mode = arg('mode', 'after');
const outDir = path.resolve(arg('out', path.join('docs/screenshots/daynight', mode)));
fs.mkdirSync(outDir, { recursive: true });

const port = 5198;
const server = spawn(process.execPath, [path.join(root, 'tests', 'serve.mjs')], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const baseUrl = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(baseUrl);
    if (res.ok) break;
  } catch {
    // server booting
  }
  await new Promise((r) => setTimeout(r, 250));
}

function analyze(png) {
  const { width: w, height: h, data } = png;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w - 430; x += 4) {
      const i = (w * y + x) * 4;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
  }
  return sum / n;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

async function shot(name) {
  const buf = await page.screenshot();
  const png = PNG.sync.read(buf);
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 84);
  const file = path.join(outDir, `${name}.jpg`);
  fs.writeFileSync(file, encoded.data);
  const mean = analyze(png);
  console.log(name, `mean=${Math.round(mean)}`, `${(encoded.data.length / 1024).toFixed(0)} KB`, file);
  return mean;
}

const readState = () => page.evaluate(() => ({
  style: window.__CITY__.style.id,
  time: window.__CITY__.state.time,
  buttonVisible: Boolean(document.getElementById('btn-daynight')?.offsetParent),
  label: document.getElementById('mode-label')?.textContent ?? null,
  nightClass: document.getElementById('btn-daynight')?.classList.contains('is-night') ?? null,
}));

await page.goto(`${baseUrl}#style=chongqing&seed=20261119`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
await page.waitForTimeout(2600);

console.log('initial', await readState());
await shot(`${mode}-dusk`);

if (mode === 'after') {
  // Dispatch the click from page JS: Playwright's pointer click waits for
  // animation frames, and SwiftShader frames are too slow in this environment.
  const clickMode = () => page.evaluate(() => document.getElementById('btn-daynight').click());
  await clickMode();
  await page.waitForFunction(() => Math.abs(window.__CITY__.state.time - 0.2) < 1e-6, { timeout: 60000 });
  await page.waitForTimeout(1100);
  console.log('after first click', await readState());
  await shot('after-day');
  await clickMode();
  await page.waitForFunction(() => Math.abs(window.__CITY__.state.time - 0.9) < 1e-6, { timeout: 60000 });
  await page.waitForTimeout(1100);
  console.log('after second click', await readState());
  await shot('after-night');
}

// The panel becomes a bottom sheet on phones; make sure the button still fits.
// Reset to the shared dusk state first so the mobile before/after pair matches.
if (mode === 'after') {
  await page.evaluate(() => {
    const el = document.getElementById('ctrl-time');
    el.value = '0.68';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => Math.abs(window.__CITY__.state.time - 0.68) < 1e-6, { timeout: 60000 });
  await page.waitForTimeout(900);
}
await page.setViewportSize({ width: 430, height: 900 });
await page.waitForTimeout(900);
console.log('mobile', await readState());
await shot(`${mode}-mobile`);

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
server.kill();
if (errors.length) process.exit(1);
