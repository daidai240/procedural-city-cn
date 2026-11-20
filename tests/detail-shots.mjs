import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import fs from 'node:fs';
import path from 'node:path';

// Captures a fixed set of detail / silhouette scenarios for before-after
// comparison. Every scenario pins style, seed and every slider in the URL hash
// so the two captures only differ in the code revision being reviewed.
const base = (process.env.URL || 'http://127.0.0.1:5173/').replace(/#.*$/, '');
const outDir = process.env.SHOT_DIR || 'docs/screenshots/detail-lod';
const prefix = process.env.PREFIX || 'after';
fs.mkdirSync(outDir, { recursive: true });

const common = 'seed=20261119';
const scenarios = [
  {
    name: 'chongqing-southbank-close-day',
    style: 'chongqing',
    camera: { pos: [-60, 32, 320], target: [-140, 20, 235] },
    params: 'pattern=organic&density=0.9&block=0.85&avgHeight=0.9&heightVar=0.72&commercial=0.44&residential=0.46&industrial=0.1&water=0.9&parks=0.12&terrain=0.85&time=0.3&fog=0.25',
  },
  {
    name: 'chongqing-south-day',
    style: 'chongqing',
    view: 0,
    params: 'pattern=organic&density=0.9&block=0.85&avgHeight=0.9&heightVar=0.72&commercial=0.44&residential=0.46&industrial=0.1&water=0.9&parks=0.12&terrain=0.85&time=0.2&fog=0.28',
  },
  {
    name: 'chongqing-south-night',
    style: 'chongqing',
    view: 0,
    params: 'pattern=organic&density=0.9&block=0.85&avgHeight=0.9&heightVar=0.72&commercial=0.44&residential=0.46&industrial=0.1&water=0.9&parks=0.12&terrain=0.85&time=0.9&fog=0.42',
  },
  {
    name: 'lujiazui-bund-dusk',
    style: 'lujiazui',
    view: 0,
    params: 'pattern=grid&density=0.82&block=1&avgHeight=1.12&heightVar=0.62&commercial=0.72&residential=0.23&industrial=0.05&water=0.95&parks=0.1&terrain=0.04&time=0.5&fog=0.15',
  },
  {
    name: 'shenzhen-bay-night',
    style: 'shenzhen',
    view: 0,
    params: 'pattern=grid&density=0.98&block=0.72&avgHeight=1.24&heightVar=0.85&commercial=0.5&residential=0.4&industrial=0.1&water=0.45&parks=0.06&terrain=0.04&time=0.94&fog=0.4',
  },
];

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

for (const s of scenarios) {
  // A query-string marker forces a full navigation; changing only the hash
  // would keep the previous style loaded.
  const url = `${base}?shot=${s.name}#style=${s.style}&${common}&${s.params}`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.evaluate((scenario) => {
    const c = window.__CITY__;
    if (scenario.camera) {
      c.camera.position.set(...scenario.camera.pos);
      c.controls.target.set(...scenario.camera.target);
      c.controls.update();
    } else {
      const btn = document.querySelectorAll('#view-row .view-btn')[scenario.view];
      btn && btn.click();
    }
  }, s);
  await page.waitForFunction(() => window.__CITY__?.camTween && !window.__CITY__.camTween.active, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const file = path.join(outDir, `${prefix}-${s.name}.jpg`);
  const buf = await page.screenshot();
  const png = PNG.sync.read(buf);
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 80);
  fs.writeFileSync(file, encoded.data);
  const info = await page.evaluate(() => ({
    style: window.__CITY__.style.id,
    view: window.__CITY__.camera.position.toArray().map((v) => Math.round(v)),
    buildings: window.__CITY__.stats.buildings,
    roofDetails: window.__CITY__.stats.roofDetails ?? 0,
    time: window.__CITY__.state.time,
    fog: window.__CITY__.state.fog,
  }));
  console.log(s.name, JSON.stringify(info), file);
}

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
if (errors.length) process.exit(1);
