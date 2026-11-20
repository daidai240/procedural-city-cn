import * as THREE from 'three';
import { createFacadeMaterial, glowMaterial, pointGlowMaterial } from './materials.js';
import { TrafficSystem } from './traffic.js';

const UNIT_BOX = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

class BuildingBatch {
  constructor(material, geometry, withData) {
    this.material = material;
    this.geometry = geometry;
    this.withData = withData;
    this.items = [];
  }

  add(item) {
    this.items.push(item);
  }

  build() {
    const n = this.items.length;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    const data = this.withData ? new Float32Array(n * 4) : null;
    const color = new THREE.Color();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      e.set(0, it.rotY || 0, 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y || 0, it.z);
      scale.set(it.w, it.h, it.d);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      color.set(it.color || '#cccccc');
      mesh.setColorAt(i, color);
      if (data) {
        data[i * 4] = it.seed ?? Math.random();
        data[i * 4 + 1] = it.lit ?? 0.5;
        data[i * 4 + 2] = it.variant ?? 0.5;
        data[i * 4 + 3] = it.kind ?? 0;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (data) {
      this.geometry.setAttribute('aBldg', new THREE.InstancedBufferAttribute(data, 4));
    }
    mesh.frustumCulled = false;
    return mesh;
  }
}

class InstanceBatch {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }

  add(item) {
    this.items.push(item);
  }

  build() {
    const n = this.items.length;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      e.set(it.rotX || 0, it.rotY || 0, it.rotZ || 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y || 0, it.z);
      scale.set(it.w, it.h, it.d);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      color.set(it.color || '#ffffff');
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

export class BuildContext {
  constructor({ world, style, params, rng }) {
    this.world = world;
    this.style = style;
    this.params = params;
    this.rng = rng;
    this.labels = [];
    this.tickers = [];
    this.dynamicUniforms = [];
    this.textures = [];
    this.materials = [];
    this.batches = [];
    this._facadeCache = new Map();
    this._matCache = new Map();
    this._batchCache = new Map();
    this._unitBox = UNIT_BOX();
    this.buildingCount = 0;
    this.lampPoints = [];
    this.lampColors = [];
    this.traffic = new TrafficSystem();
    this._labelId = 0;
  }

  facade(key, opts) {
    if (this._facadeCache.has(key)) return this._facadeCache.get(key);
    const m = createFacadeMaterial(opts);
    this._facadeCache.set(key, m);
    this.materials.push(m);
    return m;
  }

  mat(key, opts = {}) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color ?? '#888888'),
      roughness: opts.roughness ?? 0.8,
      metalness: opts.metalness ?? 0.08,
      emissive: new THREE.Color(opts.emissive ?? '#000000'),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      flatShading: opts.flatShading ?? false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    if (opts.map) m.map = opts.map;
    this._matCache.set(key, m);
    this.materials.push(m);
    return m;
  }

  basic(key, opts = {}) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(opts.color ?? '#ffffff'),
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      blending: opts.blending ?? THREE.NormalBlending,
      depthWrite: opts.depthWrite ?? true,
      side: opts.side ?? THREE.FrontSide,
    });
    this._matCache.set(key, m);
    this.materials.push(m);
    return m;
  }

  glow(key, color, opacity = 1, scale = 2) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const m = glowMaterial(color, opacity, scale);
    this._matCache.set(key, m);
    this.materials.push(m);
    return m;
  }

  batch(key, material, geometry) {
    if (this._batchCache.has(key)) return this._batchCache.get(key);
    const withData = !geometry;
    const b = new BuildingBatch(material, geometry || this._unitBox.clone(), withData);
    this._batchCache.set(key, b);
    this.batches.push(b);
    return b;
  }

  building(key, material) {
    return this.batch(key, material);
  }

  instance(key, geometry, material) {
    if (this._batchCache.has(key)) return this._batchCache.get(key);
    const b = new InstanceBatch(geometry, material);
    this._batchCache.set(key, b);
    this.batches.push(b);
    return b;
  }

  addBuilding(batchKey, material, item) {
    const b = this.building(batchKey, material);
    b.add(item);
    this.buildingCount++;
  }

  mesh(geo, material, x = 0, y = 0, z = 0, rotY = 0, parent = this.world) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    parent.add(m);
    return m;
  }

  box(material, w, h, d, x, y, z, rotY = 0, parent = this.world) {
    const m = new THREE.Mesh(this._unitBox, material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.scale.set(w, h, d);
    parent.add(m);
    return m;
  }

  cylinder(material, rTop, rBottom, h, x, y, z, segments = 16, parent = this.world) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    return m;
  }

  sphere(material, r, x, y, z, segments = 20, parent = this.world) {
    const geo = new THREE.SphereGeometry(r, segments, Math.max(10, Math.round(segments * 0.7)));
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  plane(material, w, h, x, y, z, rotX = -Math.PI / 2, parent = this.world) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    parent.add(m);
    return m;
  }

  label(name, sub, x, y, z) {
    this.labels.push({ id: `lm-${this._labelId++}`, name, sub, x, y, z });
  }

  tree(x, y, z, scale = 1, type = 'round', color = '#4f7a46') {
    const rng = this.rng;
    const h = (type === 'willow' ? 7.5 : 8.5) * scale * rng.range(0.8, 1.2);
    const r = (type === 'willow' ? 3.4 : 2.6) * scale * rng.range(0.8, 1.25);
    this.instance('trunks', this._treeTrunkGeo(), this.mat('trunk', { color: '#4a3a2c', roughness: 0.95 })).add({
      x, y, z, w: 0.5 * scale, h: h * 0.62, d: 0.5 * scale, color: '#4a3a2c',
    });
    const tint = new THREE.Color(color).offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.08, 0.08), rng.range(-0.1, 0.08));
    const base = type === 'round' ? h * 0.62 : h * 0.42;
    if (type === 'willow') {
      this.instance('willow', this._willowGeo(), this.mat('leaves-willow', { color: '#6f8f5a', roughness: 0.9, flatShading: true })).add({
        x, y: base + r * 0.2, z, w: r * 1.15, h: r * 1.35, d: r * 1.15, color: tint,
      });
    } else if (type === 'pine') {
      this.instance('pine', this._pineGeo(), this.mat('leaves-pine', { color: '#3f6242', roughness: 0.9, flatShading: true })).add({
        x, y: base, z, w: r * 1.15, h: h * 0.75, d: r * 1.15, color: tint,
      });
    } else {
      this.instance('round', this._roundTreeGeo(), this.mat('leaves', { color: '#537c46', roughness: 0.9, flatShading: true })).add({
        x, y: base, z, w: r * 1.35, h: r * 1.5, d: r * 1.35, color: tint,
      });
    }
  }

  _treeTrunkGeo() {
    if (!this._trunkGeo) {
      this._trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 5, 1);
      this._trunkGeo.translate(0, 0.5, 0);
    }
    return this._trunkGeo;
  }

  _roundTreeGeo() {
    if (!this._roundGeo) {
      this._roundGeo = new THREE.IcosahedronGeometry(0.5, 1);
      this._roundGeo.translate(0, 0.5, 0);
    }
    return this._roundGeo;
  }

  _pineGeo() {
    if (!this._pineGeoCache) {
      this._pineGeoCache = new THREE.ConeGeometry(0.5, 1, 7, 1);
      this._pineGeoCache.translate(0, 0.5, 0);
    }
    return this._pineGeoCache;
  }

  _willowGeo() {
    if (!this._willowGeoCache) {
      this._willowGeoCache = new THREE.SphereGeometry(0.5, 8, 6);
      this._willowGeoCache.scale(1.1, 1.35, 1.1);
      this._willowGeoCache.translate(0, 0.5, 0);
    }
    return this._willowGeoCache;
  }

  lamp(x, y, z, color = '#ffce8a', scale = 1) {
    this.lampPoints.push(x, y, z);
    const c = new THREE.Color(color).multiplyScalar(scale);
    this.lampColors.push(c.r, c.g, c.b);
  }

  trafficPath(points, opts) {
    this.traffic.addPath(points, opts);
  }

  ticker(fn) {
    this.tickers.push(fn);
  }

  addTexture(tex) {
    this.textures.push(tex);
    return tex;
  }

  finalize() {
    for (const b of this.batches) {
      const mesh = b.build();
      if (mesh) this.world.add(mesh);
    }
    if (this.lampPoints.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.lampPoints, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.lampColors, 3));
      const mat = pointGlowMaterial(1.5, 0.85);
      mat.userData.disposeOnClear = true;
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.world.add(pts);
      this.materials.push(mat);
      this.lampMaterial = mat;
    }
    const trafficPoints = this.traffic.build();
    if (trafficPoints) {
      this.world.add(trafficPoints);
      this.materials.push(trafficPoints.material);
    }
    return {
      buildings: this.buildingCount,
      labels: this.labels,
      traffic: this.traffic,
    };
  }

  update(dt, elapsed) {
    for (const fn of this.tickers) fn(elapsed, dt);
    this.traffic.update(dt);
  }

  dispose() {
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.tickers.length = 0;
  }
}
