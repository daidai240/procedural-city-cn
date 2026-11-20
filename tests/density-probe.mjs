import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:5182/#style=chongqing&seed=20261119', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => window.__CITY__.stats.buildings);
await page.evaluate(() => {
  const el = document.getElementById('ctrl-density');
  el.value = '0.3';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(6000);
const after = await page.evaluate(() => window.__CITY__.stats.buildings);
await page.waitForTimeout(500);
const seedA = await page.evaluate(() => { window.__CITY__.setState({ seed: 424242 }); return window.__CITY__.stats.buildings; });
await page.waitForTimeout(2500);
const seedB = await page.evaluate(() => { window.__CITY__.setState({ seed: 424242 }); return window.__CITY__.stats.buildings; });
console.log(JSON.stringify({
  before, after, densityChanged: before !== after, seedA, seedB,
  deterministic: seedA === seedB, errors,
}, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
