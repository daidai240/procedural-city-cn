import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.URL || 'http://127.0.0.1:5173/';
const outDir = process.env.SHOT_DIR || 'docs/screenshots/final';
fs.mkdirSync(outDir, { recursive: true });

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

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
await page.waitForTimeout(2600);

const ids = ['chongqing', 'lujiazui', 'xian', 'shenzhen', 'jiangnan'];
for (const id of ids) {
  if (id !== 'chongqing') {
    await page.click(`.preset[data-style="${id}"]`);
    await page.waitForFunction((target) => window.__CITY__?.style.id === target, id, { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.waitForFunction(() => window.__CITY__?.camTween && !window.__CITY__.camTween.active, { timeout: 30000 });
    await page.waitForTimeout(900);
  }
  const file = path.join(outDir, `${id}.png`);
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => ({
    buildings: window.__CITY__.stats.buildings,
    labels: window.__CITY__.ctx.labels.length,
    frameCount: window.__CITY__.frameCount,
  }));
  console.log(id, info, file);
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
