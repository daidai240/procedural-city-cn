import * as THREE from 'three';
import { makeNoise2D } from './rng.js';

// Sampled heightfield with bilinear lookup and vertex-coloured mesh.
export class Heightfield {
  constructor({ size = 620, segments = 150, heightFn, colorFn }) {
    this.size = size;
    this.half = size / 2;
    this.segments = segments;
    this.n = segments + 1;
    this.heightFn = heightFn;
    this.colorFn = colorFn;
    this.heights = new Float32Array(this.n * this.n);
    for (let i = 0; i < this.n; i++) {
      const x = -this.half + (i / segments) * size;
      for (let j = 0; j < this.n; j++) {
        const z = -this.half + (j / segments) * size;
        this.heights[i * this.n + j] = heightFn(x, z);
      }
    }
    this._noise = makeNoise2D(991);
  }

  heightAt(x, z) {
    const seg = this.segments;
    const fx = ((x + this.half) / this.size) * seg;
    const fz = ((z + this.half) / this.size) * seg;
    const i = Math.max(0, Math.min(seg - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(seg - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));
    const h00 = this.heights[i * this.n + j];
    const h10 = this.heights[(i + 1) * this.n + j];
    const h01 = this.heights[i * this.n + j + 1];
    const h11 = this.heights[(i + 1) * this.n + j + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  slopeAt(x, z) {
    const d = 2.5;
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return Math.hypot(hx, hz) / (2 * d);
  }

  buildMesh(material) {
    const n = this.n;
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = -this.half + (i / this.segments) * this.size;
      for (let j = 0; j < n; j++) {
        const z = -this.half + (j / this.segments) * this.size;
        const idx = (i * n + j) * 3;
        const h = this.heights[i * n + j];
        positions[idx] = x;
        positions[idx + 1] = h;
        positions[idx + 2] = z;
        const slope = this.slopeAt(x, z);
        const c = this.colorFn(x, z, h, slope, this._noise);
        color.set(c);
        colors[idx] = color.r;
        colors[idx + 1] = color.g;
        colors[idx + 2] = color.b;
      }
    }
    const indices = [];
    for (let i = 0; i < this.segments; i++) {
      for (let j = 0; j < this.segments; j++) {
        const a = i * n + j;
        const b = (i + 1) * n + j;
        const c = i * n + j + 1;
        const d = (i + 1) * n + j + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
  }
}

export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}
