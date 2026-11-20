// Build a 5-city greyscale silhouette sheet (acceptance A): 320 px wide per
// city, same crop (left of the panel) and same order.
// Usage: node tests/silhouettes.mjs out.png before/chongqing.png ... (5 files)

import { PNG } from 'pngjs';
import fs from 'node:fs';

const [out, ...files] = process.argv.slice(2);
if (files.length !== 5) {
  console.error('pass output + 5 city PNGs');
  process.exit(1);
}
const targetW = 320;
const targetH = 200;
const gap = 6;
const sheetW = targetW * 5 + gap * 6;
const sheetH = targetH + gap * 2;
const sheet = new PNG({ width: sheetW, height: sheetH });
sheet.data.fill(12);

files.forEach((file, index) => {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data } = png;
  const cropW = Math.min(w, 1010); // exclude the right parameter panel
  const cropH = Math.min(h, 900);
  const ox = gap + index * (targetW + gap);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(cropW - 1, Math.floor((x / targetW) * cropW));
      const sy = Math.min(cropH - 1, Math.floor((y / targetH) * cropH));
      const i = (w * sy + sx) * 4;
      const lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      const o = (sheetW * (y + gap) + ox + x) * 4;
      sheet.data[o] = lum;
      sheet.data[o + 1] = lum;
      sheet.data[o + 2] = lum;
      sheet.data[o + 3] = 255;
    }
  }
});
fs.writeFileSync(out, PNG.sync.write(sheet));
console.log(`wrote ${out}`);
