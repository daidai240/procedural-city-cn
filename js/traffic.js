import * as THREE from 'three';
import { samplePath } from './geom.js';

// Moving headlights / tail lights along generated road and rail paths.
export class TrafficSystem {
  constructor() {
    this.paths = [];
    this.points = null;
    this.positions = null;
    this.total = 0;
  }

  addPath(points, opts = {}) {
    if (!points || points.length < 2) return;
    const sampled = samplePath(points, opts.divisions ?? 72);
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < sampled.length; i++) {
      total += sampled[i].distanceTo(sampled[i - 1]);
      lengths.push(total);
    }
    if (total < 6) return;
    this.paths.push({
      pts: sampled,
      lengths,
      total,
      speed: opts.speed ?? 11,
      count: opts.count ?? Math.max(3, Math.min(28, Math.round(total / 22))),
      offset: opts.offset ?? 2.1,
      color: opts.color ?? null,
      yLift: opts.yLift ?? 0.4,
    });
  }

  build() {
    const rand = (a, b) => a + Math.random() * (b - a);
    this.particles = [];
    for (let pi = 0; pi < this.paths.length; pi++) {
      const path = this.paths[pi];
      for (let i = 0; i < path.count; i++) {
        this.particles.push({
          path,
          s: Math.random() * path.total,
          speed: path.speed * rand(0.65, 1.35),
          side: (Math.random() < 0.5 ? -1 : 1) * path.offset * rand(0.5, 1.1),
          color: path.color
            ? new THREE.Color(path.color)
            : (Math.random() < 0.66 ? new THREE.Color('#ffe4b0') : new THREE.Color('#ff4a3d')),
          brightness: rand(0.7, 1.3),
        });
      }
    }
    const n = this.particles.length;
    if (!n) return;
    this.total = n;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      colors[i * 3] = p.color.r * p.brightness;
      colors[i * 3 + 1] = p.color.g * p.brightness;
      colors[i * 3 + 2] = p.color.b * p.brightness;
      this.sampleParticle(p, this.positions, i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.1,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.material = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    return this.points;
  }

  sampleParticle(p, arr, i) {
    const path = p.path;
    const pts = path.pts;
    // binary search cumulative length
    let lo = 0;
    let hi = path.lengths.length - 1;
    const s = ((p.s % path.total) + path.total) % path.total;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (path.lengths[mid] <= s) lo = mid;
      else hi = mid;
    }
    const segLen = path.lengths[hi] - path.lengths[lo] || 1;
    const t = (s - path.lengths[lo]) / segLen;
    const a = pts[lo];
    const b = pts[hi];
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + path.yLift;
    const z = a.z + (b.z - a.z) * t;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    arr[i * 3] = x + (dz / len) * p.side;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z - (dx / len) * p.side;
  }

  update(dt) {
    if (!this.particles || !this.positions) return;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.s += p.speed * dt;
      if (p.s > p.path.total) p.s -= p.path.total;
      this.sampleParticle(p, this.positions, i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  setNight(night) {
    if (this.material) this.material.opacity = 0.25 + night * 0.75;
  }
}
