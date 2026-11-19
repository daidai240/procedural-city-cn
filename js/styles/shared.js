import * as THREE from 'three';
import { ribbonGeometry, samplePath } from '../geom.js';

export function addSlab(ctx, x, z, w, d, topY, material, h = 1.2) {
  return ctx.box(material, w, h, d, x, topY - h, z);
}

export function groundMaterial(ctx, key, color = '#22262b', roughness = 0.95) {
  return ctx.mat(key, { color, roughness, metalness: 0.02 });
}

export function roadMaterial(ctx, key = 'road', color = '#15181c') {
  return ctx.mat(key, { color, roughness: 0.72, metalness: 0.05 });
}

// Adds a road ribbon plus traffic on the same path.
export function addRoad(ctx, points, opts = {}) {
  const width = opts.width ?? 7;
  const material = opts.material ?? roadMaterial(ctx);
  const sampled = samplePath(points, opts.divisions ?? 80);
  const geo = ribbonGeometry(sampled, width, opts.yLift ?? 0.12);
  if (geo) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 1;
    ctx.world.add(mesh);
  }
  if (opts.traffic !== false) {
    ctx.trafficPath(sampled, {
      speed: opts.speed ?? 12,
      offset: opts.offset ?? Math.max(1.2, width * 0.28),
      count: opts.count,
      color: opts.trafficColor,
    });
  }
  if (opts.lamps) {
    addLampsAlong(ctx, sampled, opts.lampSpacing ?? 18, opts.lampColor ?? '#ffd09a', opts.lampOffset ?? width * 0.7);
  }
  return sampled;
}

export function addLampsAlong(ctx, points, spacing = 18, color = '#ffd09a', offset = 5) {
  let carry = 0;
  let lampIndex = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    carry += len;
    if (carry >= spacing) {
      carry = 0;
      const side = lampIndex % 2 === 0 ? 1 : -1;
      lampIndex++;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const x = b.x + (dz / l) * offset * side;
      const z = b.z - (dx / l) * offset * side;
      ctx.lamp(x, b.y + 4.2, z, color, 1);
    }
  }
}

// Simple grid of streets. Returns the sampled paths.
export function addStreetGrid(ctx, opts) {
  const { x0, x1, z0, z1, spacingX = 34, spacingZ = 30, width = 6.5, jitter = 0 } = opts;
  const paths = [];
  const rng = ctx.rng;
  const nX = Math.max(1, Math.round((x1 - x0) / spacingX));
  const nZ = Math.max(1, Math.round((z1 - z0) / spacingZ));
  for (let i = 0; i <= nX; i++) {
    const x = x0 + (i / nX) * (x1 - x0);
    if (i === 0 || i === nX) {
      const pts = [
        { x, y: 0.6, z: z0 },
        { x, y: 0.6, z: (z0 + z1) / 2 },
        { x, y: 0.6, z: z1 },
      ];
      paths.push(addRoad(ctx, pts, { width: width + 1.4, lamps: true, divisions: 24 }));
    } else {
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const z = z0 + ((z1 - z0) * k) / 6;
        const off = jitter ? Math.sin((k + i) * 1.7) * jitter : 0;
        pts.push({ x: x + off, y: 0.6, z });
      }
      paths.push(addRoad(ctx, pts, { width, lamps: true, divisions: 32 }));
    }
  }
  for (let j = 0; j <= nZ; j++) {
    const z = z0 + (j / nZ) * (z1 - z0);
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const x = x0 + ((x1 - x0) * k) / 7;
      const off = jitter ? Math.cos((k + j) * 1.3) * jitter : 0;
      pts.push({ x, y: 0.62, z: z + off });
    }
    paths.push(addRoad(ctx, pts, { width, lamps: true, divisions: 40 }));
  }
  return paths;
}

export function addPark(ctx, x, z, w, d, color = '#31452f') {
  const mat = ctx.mat('park-green', { color, roughness: 0.98 });
  ctx.box(mat, w, 0.5, d, x, -0.1, z);
  const rng = ctx.rng;
  const count = Math.max(2, Math.floor((w * d) / 300));
  for (let i = 0; i < count; i++) {
    ctx.tree(x + rng.range(-w / 2, w / 2), 0.42, z + rng.range(-d / 2, d / 2), rng.range(0.7, 1.1), 'round', '#4c7442');
  }
}

export function addSimpleBridge(ctx, x, z, len, width, height, mat, deckMat) {
  const deck = ctx.box(deckMat, len, 0.9, width, x, height, z);
  for (let i = -1; i <= 1; i++) {
    ctx.cylinder(mat, 1.2, 1.6, height, x + i * (len / 3), 0, z, 10);
  }
  return deck;
}

export function makeQuad(sampled, width) {
  const geo = ribbonGeometry(sampled, width, 0.06);
  return geo;
}
