import { chromium } from 'playwright';

const url = process.env.BASE_URL || 'http://127.0.0.1:5182/';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${url}#style=chongqing&seed=20261119`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__CITY_READY__ === true, { timeout: 120000 });
const data = await page.evaluate(() => {
  const ctx = window.__CITY__.ctx;
  const pts = {
    hongya: [98, 92], liziba: [-26, 8], interchange: [158, 46], raffles: [16, 78],
    center: [0, 0], jiefangbei: [30, 20], westBridge: [-126, 80], eastBridge: [146, 150],
    southBank: [0, 240], farSouth: [0, 400], north: [0, -150], west: [-200, 0], east: [240, 0],
  };
  const heights = {};
  for (const [k, [x, z]] of Object.entries(pts)) heights[k] = Math.round(ctx.heightAt(x, z) * 10) / 10;
  const views = window.__CITY__.style.views.map((v) => ({ key: v.key, pos: v.pos, target: v.target }));
  return { heights, views, stats: window.__CITY__.stats.buildings };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
