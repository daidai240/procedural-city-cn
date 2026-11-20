// Measure how much of the ground-only night frame is still crushed to black.
// Usage: node tests/measure-ground.mjs shots/r1/chongqing-night-ground-before.png shots/r1/chongqing-night-ground-after.png

import { PNG } from 'pngjs';
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('pass one or more PNG paths');
  process.exit(1);
}

for (const file of files) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data } = png;
  const x0 = 40;
  const x1 = w - 460; // skip the panel / frame edges
  const y0 = Math.round(h * 0.45); // lower frame: ground, water, foreground
  const y1 = h - 40;
  const lums = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (w * y + x) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      lums.push(lum);
    }
  }
  lums.sort((a, b) => a - b);
  const at = (p) => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))];
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const below19 = lums.filter((v) => v < 19.3).length / lums.length;
  const below12 = lums.filter((v) => v < 12).length / lums.length;
  console.log(JSON.stringify({
    file,
    mean: +mean.toFixed(1),
    p1: +at(0.01).toFixed(1),
    p5: +at(0.05).toFixed(1),
    p50: +at(0.5).toFixed(1),
    below_101418: +(below19 * 100).toFixed(1),
    below_black12: +(below12 * 100).toFixed(1),
  }));
}
