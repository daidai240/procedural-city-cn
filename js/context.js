import * as THREE from 'three';
import { createFacadeMaterial, glowMaterial, pointGlowMaterial } from './materials.js';
import { TrafficSystem } from './traffic.js';

const UNIT_BOX = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clampNum(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

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
        // Deterministic fallback: the whole city must be reproducible from the
        // seed, so never reach for Math.random() here.
        data[i * 4] = it.seed ?? (i * 0.61803398875) % 1;
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
      if (it.quaternion) {
        q.copy(it.quaternion);
      } else {
        e.set(it.rotX || 0, it.rotY || 0, it.rotZ || 0);
        q.setFromEuler(e);
      }
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
    this.roofDetails = 0;
    this.lampPoints = [];
    this.lampColors = [];
    this.traffic = new TrafficSystem(this.rng);
    this._labelId = 0;
    this.heightAt = null;
    this.slopeAt = null;
    this._foundationBatch = null;
    this._foundationMat = null;
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
    this.addRoofDetail(item);
  }

  // Rooftop structure shared by every flat-roofed building family: a parapet
  // ring plus, on larger roofs, a stair tower / water tank / AC units. All of
  // it goes into one InstancedMesh batch, so the extra close-up detail costs a
  // single draw call. Styles that build their own pitched roofs opt out with
  // `roofDetail: false`; individual buildings can opt out with `roof: false`.
  addRoofDetail(item) {
    if (this.style.roofDetail === false || item.roof === false) return;
    const { x, y, z, w, d, h } = item;
    if (!(h > 8) || !(w > 4) || !(d > 4)) return;
    if (!this._roofDetailMaterial) {
      this._roofDetailMaterial = this.mat('roof-detail', {
        color: '#ffffff', roughness: 0.86, metalness: 0.06,
      });
    }
    const batch = this.instance('roof-detail', this._unitBox, this._roofDetailMaterial);
    const seed = Number.isFinite(item.seed) ? item.seed : 0.37;
    const r0 = hash01(seed * 917.3 + 3.1);
    const r1 = hash01(seed * 333.7 + 11.7);
    const r2 = hash01(seed * 577.1 + 7.3);
    const roofY = y + h;
    const t = Math.min(0.45, Math.min(w, d) * 0.06 + 0.12);
    const ph = 0.7 + r0 * 1.1;
    const grey = ['#7c7f83', '#6e7277', '#8a8d90', '#666a6f'][Math.floor(r1 * 4) % 4];

    // Parapet ring around the roof edge.
    batch.add({ x, y: roofY, z: z + d / 2 - t / 2, w, h: ph, d: t, color: grey });
    batch.add({ x, y: roofY, z: z - d / 2 + t / 2, w, h: ph, d: t, color: grey });
    batch.add({ x: x + w / 2 - t / 2, y: roofY, z, w: t, h: ph, d: Math.max(0.5, d - 2 * t), color: grey });
    batch.add({ x: x - w / 2 + t / 2, y: roofY, z, w: t, h: ph, d: Math.max(0.5, d - 2 * t), color: grey });
    this.roofDetails += 4;

    if (w * d < 130 || h < 14 || r2 > 0.82) return;

    // Stair / elevator bulkhead.
    const sw = w * (0.16 + 0.10 * r1);
    const sd = d * (0.16 + 0.12 * r2);
    const sh = 2.2 + 2.2 * r0;
    const ox = clampNum((r1 - 0.5) * (w - sw - 2.4), -w / 2 + sw / 2 + 1.2, w / 2 - sw / 2 - 1.2);
    const oz = clampNum((r2 - 0.5) * (d - sd - 2.4), -d / 2 + sd / 2 + 1.2, d / 2 - sd / 2 - 1.2);
    batch.add({ x: x + ox, y: roofY + 0.02, z: z + oz, w: sw, h: sh, d: sd, color: '#5f6368' });
    this.roofDetails++;

    // Rooftop plant: water tank and AC boxes tucked beside the bulkhead.
    const units = 1 + Math.floor(r0 * 3);
    for (let i = 0; i < units; i++) {
      const u1 = hash01(seed * 1301.9 + i * 7.7);
      const u2 = hash01(seed * 1777.3 + i * 3.9);
      const uw = 0.9 + u1 * 1.4;
      const ud = 0.9 + u2 * 1.4;
      const uh = 0.7 + u1 * 1.3;
      const px = clampNum((u2 - 0.5) * (w - uw - 1.2), -w / 2 + uw / 2 + 0.6, w / 2 - uw / 2 - 0.6);
      const pz = clampNum((u1 - 0.5) * (d - ud - 1.2), -d / 2 + ud / 2 + 0.6, d / 2 - ud / 2 - 0.6);
      if (Math.hypot(px - ox, pz - oz) < Math.max(sw, sd) * 0.72) continue;
      batch.add({
        x: x + px, y: roofY + 0.02, z: z + pz, w: uw, h: uh, d: ud,
        color: u1 > 0.55 ? '#8f9296' : '#6b6f74',
      });
      this.roofDetails++;
    }
    if (h > 46 && r0 > 0.55) {
      const tank = 1.8 + r1 * 1.1;
      batch.add({
        x: x - ox * 0.6, y: roofY + 0.02, z: z - oz * 0.6,
        w: tank, h: 2.0 + r2 * 0.9, d: tank, color: '#9aa0a4',
      });
      this.roofDetails++;
    }
  }

  // Bind a Heightfield so every placed building / landmark can be grounded.
  bindTerrain(hf) {
    this._terrain = hf;
    this.heightAt = (x, z) => hf.heightAt(x, z);
    this.slopeAt = (x, z) => hf.slopeAt(x, z);
    return hf;
  }

  // Ground / terrain surface with a faint base emission and a soft grazing
  // sheen after dark. Its fog thins with altitude, so the far bank stays
  // legible at night instead of collapsing into a black band.
  nightSurface(key, opts = {}) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const m = this.mat(key, {
      color: opts.color ?? '#ffffff',
      roughness: opts.roughness ?? 0.95,
      metalness: opts.metalness ?? 0.02,
    });
    const uniforms = {
      uNight: { value: 0 },
      uNightLift: {
        value: new THREE.Color(opts.nightLift ?? '#18222e')
          .multiplyScalar(opts.nightLiftScale ?? 0.55),
      },
      uSheenColor: { value: new THREE.Color(opts.sheenColor ?? '#3c5878') },
      uSheen: { value: opts.sheen ?? 0.22 },
    };
    m.userData.uniforms = uniforms;
    m.customProgramCacheKey = () => `city-night-surface-${key}`;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vWorldY;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uNight;
          uniform vec3 uNightLift;
          uniform vec3 uSheenColor;
          uniform float uSheen;
          varying float vWorldY;`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float sheenFres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uNightLift * uNight * (0.55 + 0.45 * sheenFres);
          totalEmissiveRadiance += uSheenColor * uNight * sheenFres * uSheen;`
        )
        .replace(
          '#include <fog_fragment>',
          `#ifdef USE_FOG
            float fogAltitude = mix(1.0, 0.3, smoothstep(0.0, 72.0, vWorldY));
            #ifdef FOG_EXP2
              float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * fogAltitude);
            #else
              float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * fogAltitude;
            #endif
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
          #endif`
        );
    };
    return m;
  }

  // Grounded building pad. Samples four corners + centre, extends the
  // foundation down to the lowest sample minus three metres, and caps the
  // exposed part with a 0.6 m plinth. Buildings can neither float over a slope
  // nor sink half into it.
  foundation(x, z, w, d, opts = {}) {
    const heightAt = opts.heightAt || this.heightAt;
    const margin = opts.margin ?? 0.35;
    if (!this._foundationMat) {
      this._foundationMat = this.mat('foundation-stone', {
        color: '#ffffff', roughness: 0.92, metalness: 0.03,
        emissive: '#171b20', emissiveIntensity: 1,
      });
    }
    if (!this._foundationBatch) {
      this._foundationBatch = this.instance('foundations', this._unitBox.clone(), this._foundationMat);
    }
    const batch = this._foundationBatch;
    if (!heightAt) {
      const base = opts.base ?? 0;
      batch.add({
        x, y: base - 3, z, w: w * 1.04, h: 3, d: d * 1.04,
        color: opts.color ?? '#54585c',
      });
      return base;
    }
    const samples = [
      heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z - d / 2),
      heightAt(x - w / 2, z + d / 2), heightAt(x + w / 2, z + d / 2),
      heightAt(x, z),
    ];
    let min = Infinity;
    let max = -Infinity;
    for (const h of samples) {
      if (h < min) min = h;
      if (h > max) max = h;
    }
    const base = (opts.base ?? max) + margin;
    const bottom = min - 3;
    batch.add({
      x, y: bottom, z, w: w * 1.04, h: base - bottom, d: d * 1.04,
      color: opts.color ?? '#6a6e72',
    });
    if (base - min > 0.6) {
      batch.add({
        x, y: base - 0.6, z, w: w * 1.08, h: 0.6, d: d * 1.08,
        color: opts.capColor ?? '#85898d',
      });
    }
    return base;
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
      roofDetails: this.roofDetails,
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
