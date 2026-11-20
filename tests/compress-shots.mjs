import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const root = 'shots';
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.png')) {
      const png = PNG.sync.read(fs.readFileSync(full));
      const out = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 84);
      const jpg = full.replace(/\.png$/, '.jpg');
      fs.writeFileSync(jpg, out.data);
      fs.unlinkSync(full);
      console.log(`${full} -> ${jpg} ${(out.data.length / 1024).toFixed(0)} KB`);
    }
  }
};
walk(root);
