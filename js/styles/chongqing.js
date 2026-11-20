import * as THREE from 'three';
import { makeFbm2D, smoothstep, clamp } from '../rng.js';
import { Heightfield, distToPolyline } from '../terrain.js';
import { ribbonGeometry, samplePath, gableRoofGeometry, twistedTowerGeometry, makeTextTexture } from '../geom.js';
import { addRoad, addLampsAlong } from './shared.js';

const YANGTZE = [
  [-360, 152], [-240, 146], [-130, 140], [-20, 146], [90, 153], [210, 158], [360, 168],
];
const JIALING = [
  [-150, -360], [-142, -240], [-132, -140], [-120, -30], [-126, 60], [-118, 120], [-100, 150],
];

const PALETTE = {
  day: {
    skyTop: '#7898b0', skyHorizon: '#ced6d3', skyBottom: '#9fa9a6', sunColor: '#fff0d8',
    fogColor: '#b9c3c1', hemiSky: '#b8cad8', hemiGround: '#4a4036', horizonGlow: '#e7dcc8',
    waterDeep: '#26383a', waterShallow: '#4f6462', sunIntensity: 1.7, hemiIntensity: 0.8,
  },
  dusk: {
    skyTop: '#455272', skyHorizon: '#ffa165', skyBottom: '#8a6660', sunColor: '#ffb06e',
    fogColor: '#cf9275', hemiSky: '#ffc39a', hemiGround: '#3b2d2a', horizonGlow: '#ff7a3d',
    waterDeep: '#3a3138', waterShallow: '#6b5150', sunIntensity: 1.25, hemiIntensity: 0.62,
  },
  night: {
    skyTop: '#040a14', skyHorizon: '#122030', skyBottom: '#070c12', sunColor: '#9fb8d8',
    fogColor: '#0a1119', hemiSky: '#334a6a', hemiGround: '#4a2a1c', horizonGlow: '#7a2a12',
    waterDeep: '#07131a', waterShallow: '#1c343c', sunIntensity: 0.45, hemiIntensity: 0.78,
  },
  nightCityGlow: 0.75,
  nightGlowColor: '#ff7a3a',
};

export default {
  id: 'chongqing',
  index: '01',
  name: '重庆',
  en: 'CHONGQING',
  sub: '8D 魔幻山城',
  tagline: '两江交汇 · 层叠立交 · 轻轨穿楼',
  accent: '#ff9a4d',
  accent2: '#ffd9a3',
  accentRgb: '255, 154, 77',
  fogScale: 1.15,
  exposure: 1.1,
  waterReflect: 0.3,
  env: PALETTE,
  patterns: [
    { value: 'organic', label: '依山就势' },
    { value: 'grid', label: '棋盘街区' },
    { value: 'radial', label: '环状放射' },
  ],
  defaults: {
    density: 0.9, block: 0.85, avgHeight: 0.9, heightVar: 0.72,
    commercial: 0.44, residential: 0.46, industrial: 0.1,
    water: 0.9, parks: 0.12, terrain: 0.85, time: 0.9, fog: 0.42,
  },
  views: [
    { key: 'south', label: '南岸全景', pos: [140, 195, 490], target: [8, 22, 20] },
    { key: 'hongya', label: '洪崖洞', pos: [188, 72, 236], target: [96, 32, 88] },
    { key: 'monorail', label: '李子坝', pos: [30, 48, 128], target: [-26, 22, 6] },
  ],

  build(ctx) {
    const { rng, params } = ctx;
    const S = params.size;
    const fbm = makeFbm2D(8021, 4);
    const fbm2 = makeFbm2D(4412, 3);
    const halfYangtze = 30 + params.water * 20;
    const halfJialing = 16 + params.water * 10;

    const heightFn = (x, z) => {
      const dY = distToPolyline(x, z, YANGTZE);
      const dJ = distToPolyline(x, z, JIALING);
      const dRiver = Math.min(dY - halfYangtze, dJ - halfJialing);
      let h = 4 + fbm(x * 0.0055 + 10, z * 0.0055 - 3) * 30 * (0.5 + params.terrain * 0.9);
      const cbd = Math.exp(-((x - 20) ** 2 + (z - 6) ** 2) / (2 * 120 * 120));
      h += cbd * 16 * (0.4 + params.terrain);
      h += smoothstep(-80, -260, z) * 18 * params.terrain;
      h += smoothstep(210, 330, Math.abs(x)) * 10;
      // Fade the high-frequency ripple out towards the horizon so the distant
      // terrain silhouette stays smooth instead of breaking into jagged folds.
      const farMask = smoothstep(230, 560, Math.hypot(x, z));
      h += (fbm2(x * 0.03, z * 0.03) - 0.5) * 5 * (1.0 - farMask * 0.9);
      const bank = smoothstep(0, 34, dRiver);
      h = -7 + (h + 7) * Math.pow(bank, 0.72);
      if (bank > 0.96) h = Math.max(h, 1.4);
      return h;
    };

    const colorFn = (x, z, h, slope, noise) => {
      if (h < 0.4) return '#4a564d';
      const n = noise(x * 0.04, z * 0.04);
      if (slope > 0.52) {
        return n > 0.5 ? '#635f55' : '#565349';
      }
      const green = n > 0.55 ? '#3f5439' : n > 0.3 ? '#465c3d' : '#384b33';
      const urban = smoothstep(60, 10, Math.hypot(x - 20, z - 6));
      if (urban > 0.35 && n > 0.4) return '#4c4b45';
      return green;
    };

    const hf = new Heightfield({ size: 1200, segments: 300, heightFn, colorFn });
    ctx.terrainSegments = hf.segments;
    const terrainMat = ctx.mat('terrain', { color: '#ffffff', roughness: 0.97, metalness: 0.0 });
    terrainMat.vertexColors = true;
    const terrain = hf.buildMesh(terrainMat);
    ctx.world.add(terrain);

    // ------- materials -------
    const glass = ctx.facade('glass', {
      winA: '#d5e9ff', winB: '#ffd7a0', floorH: 4.1, colW: 3.0, lit: 0.42,
      roughness: 0.3, metalness: 0.38, rim: 0.09, rimColor: '#9ec8e8',
    });
    const res = ctx.facade('res', {
      winA: '#ffcf8c', winB: '#ffab5e', floorH: 3.15, colW: 2.25, lit: 0.72,
      roughness: 0.9, metalness: 0.02, glow: 1.6,
    });
    const old = ctx.facade('old', {
      winA: '#ffc46b', winB: '#ff8f43', floorH: 2.8, colW: 1.9, lit: 0.9,
      roughness: 0.85, metalness: 0.02, glow: 1.4,
    });
    const mega = ctx.facade('mega', {
      winA: '#d8ecff', winB: '#ffd9a8', floorH: 5.2, colW: 4.2, lit: 0.5,
      roughness: 0.26, metalness: 0.42, rim: 0.11, rimColor: '#b4d6ef',
    });
    const podiumMat = ctx.mat('podium', { color: '#4a4843', roughness: 0.95 });
    const roofMat = ctx.mat('roof', { color: '#22262a', roughness: 0.92 });
    const stoneMat = ctx.mat('stone', { color: '#5a5952', roughness: 0.92 });
    const deckMat = ctx.mat('deck', { color: '#2a2d31', roughness: 0.78 });
    const metalMat = ctx.mat('metal', { color: '#9aa4ad', roughness: 0.35, metalness: 0.75 });
    const glowWarm = ctx.glow('glow-warm', '#ffb35a', 1, 2.6);
    const beaconMat = ctx.glow('beacon', '#ff3a2c', 1, 2.8);
    const railGlow = ctx.glow('rail-glow', '#8fd7ff', 0.9, 2.4);
    const neonSign = ctx.glow('neon-sign', '#ff8a3d', 1, 2.2);

    const podiumGeo = new THREE.BoxGeometry(1, 1, 1);
    podiumGeo.translate(0, 0.5, 0);
    const podiumBatch = ctx.instance('podium', podiumGeo, podiumMat);
    const unitGlow = new THREE.BoxGeometry(1, 1, 1);
    unitGlow.translate(0, 0.5, 0);
    const eaveBatch = ctx.instance('eave', unitGlow, glowWarm);
    const antGeo = new THREE.BoxGeometry(1, 1, 1);
    antGeo.translate(0, 0.5, 0);
    const antBatch = ctx.instance('antenna', antGeo, metalMat);
    const beaconGeo = new THREE.SphereGeometry(0.6, 8, 6);
    const beaconBatch = ctx.instance('beacons', beaconGeo, beaconMat);

    // ------- helper: place one building with a slope foundation -------
    const place = (x, z, w, d, h, color, material, batchKey, opts = {}) => {
      const corners = [
        [x - w / 2, z - d / 2], [x + w / 2, z - d / 2],
        [x - w / 2, z + d / 2], [x + w / 2, z + d / 2],
      ];
      let minH = Infinity;
      let maxH = -Infinity;
      for (const [cx, cz] of corners) {
        const ch = hf.heightAt(cx, cz);
        if (ch < minH) minH = ch;
        if (ch > maxH) maxH = ch;
      }
      const base = Math.max(maxH, hf.heightAt(x, z)) + 0.4;
      const lift = base - minH;
      if (lift > 2.4 && opts.foundation !== false) {
        podiumBatch.add({
          x, y: minH - 0.4, z, w: w * 0.92, h: lift + 0.4, d: d * 0.92, color: '#45443f',
        });
      }
      ctx.addBuilding(batchKey, material, {
        x, y: base, z, w, h, d,
        color,
        lit: opts.lit ?? rng.range(0.4, 0.9),
        seed: rng.next(),
        variant: rng.next(),
      });
      if (h > 55) {
        antBatch.add({ x, y: base + h, z, w: 0.5, h: rng.range(4, 12), d: 0.5, color: '#a8b2bb' });
        if (h > 85) {
          beaconBatch.add({ x, y: base + h + 4, z, w: 1, h: 1, d: 1, color: '#ff3a2c' });
        }
      }
      return base + h;
    };

    const colorOf = (kind) => {
      if (kind === 'glass') return rng.pick(['#7f9db2', '#6d8ba1', '#89a5b8', '#728496', '#93adbd']);
      if (kind === 'old') return rng.pick(['#8c7c68', '#94836f', '#776a5b']);
      return rng.pick(['#b3a694', '#a69b8b', '#c0b3a0', '#9a9287']);
    };

    const commercial = params.commercial;
    const residential = params.residential;
    const industrial = params.industrial;
    const zoningSum = Math.max(0.001, commercial + residential + industrial);
    const pickKind = () => {
      const r = rng.next() * zoningSum;
      if (r < commercial) return 'glass';
      if (r < commercial + residential) return 'res';
      return 'old';
    };

    // ------- roads -------
    const terrainPath = (raw, lift = 0.35) => {
      const pts = raw.map(([x, z]) => ({ x, y: hf.heightAt(x, z) + lift, z }));
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < pts.length - 1; i++) {
          pts[i].y = (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4;
        }
      }
      return pts;
    };

    const riverRoads = [
      terrainPath([[-330, 108], [-210, 104], [-90, 107], [30, 112], [150, 120], [330, 132]]),
      terrainPath([[-330, 200], [-180, 196], [-40, 198], [110, 203], [330, 212]]),
      terrainPath([[-160, 140], [-152, 20], [-146, -100], [-152, -250]]),
    ];
    for (const p of riverRoads) addRoad(ctx, p, { width: 9, lamps: true, lampSpacing: 20, divisions: 90 });

    // Warm light lines along both riverbanks.
    const bankGlowLines = [
      [[-320, 112], [-180, 108], [-60, 111], [60, 116], [200, 124], [320, 136]],
      [[-320, 196], [-160, 192], [0, 195], [160, 200], [320, 210]],
      [[-158, 135], [-150, 20], [-146, -110], [-150, -250]],
    ];
    for (const raw of bankGlowLines) {
      const pts = raw.map(([x, z]) => ({ x, y: 1.15, z }));
      const sampled = samplePath(pts, 80);
      ctx.world.add(new THREE.Mesh(ribbonGeometry(sampled, 1.4, 0.06), glowWarm));
      for (let i = 0; i < sampled.length; i += 5) {
        ctx.lamp(sampled[i].x, 1.6, sampled[i].z, '#ffb46a', 0.8);
      }
    }

    const switchbacks = [
      [[-110, 116], [-60, 78], [20, 92], [78, 48], [20, 14], [72, -24], [12, -70], [58, -118], [-4, -156]],
      [[-96, -190], [-44, -150], [26, -176], [64, -112], [4, -82], [48, -24], [-18, 18], [-84, -26], [-60, -92]],
      [[110, 100], [140, 42], [102, 4], [150, -44], [98, -88], [126, -156]],
    ];
    for (const raw of switchbacks) {
      addRoad(ctx, terrainPath(raw), { width: 8, lamps: true, lampSpacing: 21, divisions: 110, speed: 9 });
    }

    // Elevated expressway through the hills.
    const viaductRaw = [[-320, 46], [-190, 30], [-80, 58], [40, 44], [170, 66], [320, 92]];
    const viaduct = addRoad(ctx, viaductRaw.map(([x, z]) => ({ x, y: 26, z })), {
      width: 13, divisions: 110, speed: 20, offset: 3.4, lamps: false,
    });
    for (let i = 6; i < viaduct.length - 6; i += 5) {
      const p = viaduct[i];
      const ground = hf.heightAt(p.x, p.z);
      if (p.y - ground > 2) {
        ctx.box(stoneMat, 2.4, p.y - ground, 2.4, p.x, ground, p.z);
      }
    }
    addLampsAlong(ctx, viaduct, 30, '#ffd7a0', 8);

    // ------- river bridges -------
    const buildCableBridge = (cx, z0, z1, baseY, pylonH) => {
      const midZ = (z0 + z1) / 2;
      ctx.box(deckMat, 14, 1.6, Math.abs(z1 - z0), cx, baseY, midZ);
      ctx.box(stoneMat, 14, 1.2, Math.abs(z1 - z0), cx, baseY + 1.2, midZ);
      const pylons = [z0 + (z1 - z0) * 0.33, z0 + (z1 - z0) * 0.67];
      const cablePts = [];
      for (let pi = 0; pi < 2; pi++) {
        const pz = pylons[pi];
        const topY = baseY + pylonH;
        ctx.cylinder(stoneMat, 1.4, 2.2, pylonH, cx, baseY, pz, 8);
        ctx.cylinder(stoneMat, 0.9, 1.2, pylonH * 0.55, cx - 8, baseY, pz, 6);
        for (let k = 1; k <= 7; k++) {
          const t = k / 8;
          const dz = (z0 + (z1 - z0) * t) - pz;
          cablePts.push(new THREE.Vector3(cx, topY, pz), new THREE.Vector3(cx, baseY + 1.2, pz + dz * 0.9));
          cablePts.push(new THREE.Vector3(cx, topY, pz), new THREE.Vector3(cx, baseY + 1.2, pz - dz * 0.9));
        }
        ctx.lamp(cx, topY + 1.5, pz, '#ff4a4a', 1.4);
      }
      const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePts);
      const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({
        color: new THREE.Color('#dbe4ec'), transparent: true, opacity: 0.75,
      }));
      ctx.world.add(cables);
      ctx.trafficPath(samplePath([{ x: cx, y: baseY + 2, z: z0 }, { x: cx, y: baseY + 2, z: midZ }, { x: cx, y: baseY + 2, z: z1 }], 40), {
        speed: 16, offset: 4, count: 20,
      });
    };

    buildCableBridge(146, 94, 214, 13, 52);
    buildCableBridge(-126, 24, 146, 12, 46);

    // ------- 黄桷湾 style stacked interchange -------
    const interchangeY = (x, z) => Math.max(10, hf.heightAt(x, z));
    const icx = 158;
    const icz = 46;
    const baseIC = interchangeY(icx, icz);
    const buildRing = (radius, y, width, segments = 64) => {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push({ x: icx + Math.cos(a) * radius, y, z: icz + Math.sin(a) * radius });
      }
      const geo = ribbonGeometry(pts, width, 0.1);
      const mesh = new THREE.Mesh(geo, deckMat);
      ctx.world.add(mesh);
      for (let i = 0; i < segments; i += 6) {
        const p = pts[i];
        const g = hf.heightAt(p.x, p.z);
        if (y - g > 2) ctx.box(stoneMat, 1.8, y - g, 1.8, p.x, g, p.z);
      }
      ctx.trafficPath(pts, { speed: 13, offset: 2.4, count: 16 });
    };
    buildRing(30, baseIC + 8, 6);
    buildRing(44, baseIC + 16, 6.5);
    buildRing(24, baseIC + 27, 5.5);
    // Straight flyovers crossing at different levels.
    for (const [off, yOff] of [[-24, 12], [0, 21], [26, 30]]) {
      const raw = [
        { x: icx - 75, y: baseIC + yOff, z: icz + off - 12 },
        { x: icx, y: baseIC + yOff, z: icz + off },
        { x: icx + 75, y: baseIC + yOff, z: icz + off + 12 },
      ];
      const sampled = addRoad(ctx, raw, { width: 7, divisions: 40, speed: 15, offset: 2.5, lamps: true, lampSpacing: 18 });
      for (let i = 8; i < sampled.length - 8; i += 8) {
        const p = sampled[i];
        const g = hf.heightAt(p.x, p.z);
        if (p.y - g > 2) ctx.box(stoneMat, 2, p.y - g, 2, p.x, g, p.z);
      }
    }
    ctx.label('黄桷湾立交', '五层立交 · 8D 魔幻', icx, baseIC + 42, icz);

    // ------- Hongyadong stilt-house tiers -------
    const hongX = 98;
    const hongZ = 92;
    const hongBase = hf.heightAt(hongX, hongZ);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 7; col++) {
        const x = hongX - 30 + col * 10.5;
        const z = hongZ - row * 9.5;
        const groundY = hf.heightAt(x, z);
        const w = rng.range(8.2, 10);
        const d = rng.range(7.4, 9);
        const h = rng.range(13, 20) + row * 2.2;
        ctx.addBuilding('old', old, {
          x, y: groundY + 0.6, z, w, h, d,
          color: rng.pick(['#8c7457', '#967d5f', '#7d674d']),
          lit: 0.95, seed: rng.next(), variant: rng.next(),
          // These tiers carry their own gable roof and eave details.
          roof: false,
        });
        // Warm eaves at every floor, facing the river.
        const floors = Math.floor(h / 3.3);
        for (let f = 0; f < floors; f += 1) {
          eaveBatch.add({
            x, y: groundY + 3.3 * f + 2.9, z: z + d / 2 + 0.32,
            w: w * 0.96, h: 0.28, d: 0.34, color: '#ffad54',
          });
        }
        // Red lanterns at the front corners.
        for (const sx of [-1, 1]) {
          eaveBatch.add({
            x: x + sx * w * 0.42, y: groundY + h * 0.72, z: z + d / 2 + 0.5,
            w: 0.5, h: 0.5, d: 0.5, color: '#ff5a2a',
          });
        }
        const roofY = groundY + 0.6 + h;
        const roof = new THREE.Mesh(gableRoofGeometry(0.9, 0.1), roofMat);
        roof.scale.set(w * 1.16, 3.6, d * 1.16);
        roof.position.set(x, roofY, z);
        ctx.world.add(roof);
        // Glowing roof ridge line.
        ctx.box(glowWarm, w * 1.04, 0.16, 0.3, x, roofY + 3.15, z);
      }
    }
    // A vertical neon sign facing the river.
    const signTex = ctx.addTexture(makeTextTexture('洪崖洞', {
      width: 160, height: 520, color: '#fff3d8', glow: '#ff8f3a',
      font: '600 110px "Microsoft YaHei", "PingFang SC", sans-serif',
    }));
    const signMat = new THREE.MeshBasicMaterial({
      map: signTex, transparent: true, side: THREE.DoubleSide,
      color: new THREE.Color(1.8, 1.5, 1.2),
    });
    signMat.userData.disposeOnClear = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 26), signMat);
    sign.position.set(hongX + 40, hongBase + 26, hongZ + 6);
    sign.rotation.y = Math.PI;
    ctx.world.add(sign);
    ctx.label('洪崖洞', '吊脚楼 · 千与千寻', hongX, hongBase + 46, hongZ + 4);

    // ------- Liziba monorail through a building -------
    const monX = -26;
    const monZ = 8;
    const monBase = hf.heightAt(monX, monZ) + 1;
    const trackY = monBase + 24;
    // Lower and upper halves with a central opening for the train.
    ctx.addBuilding('res', res, {
      x: monX, y: monBase, z: monZ, w: 28, h: 19, d: 15,
      color: '#b8aa96', lit: 0.85, seed: rng.next(), variant: 0.6,
      roof: false,
    });
    ctx.addBuilding('res', res, {
      x: monX, y: monBase + 28, z: monZ, w: 28, h: 22, d: 15,
      color: '#b8aa96', lit: 0.85, seed: rng.next(), variant: 0.6,
      roof: false,
    });
    ctx.box(stoneMat, 5.4, 9, 15, monX - 11.2, monBase + 19, monZ);
    ctx.box(stoneMat, 5.4, 9, 15, monX + 11.2, monBase + 19, monZ);
    // Roof + stair tower.
    ctx.box(roofMat, 29.4, 1.4, 16.4, monX, monBase + 50, monZ);
    ctx.box(stoneMat, 4, 3, 4, monX - 8, monBase + 51.4, monZ + 3);

    const trackPoints = [];
    for (let z = -170; z <= 120; z += 10) {
      trackPoints.push({ x: monX, y: trackY, z });
    }
    const trackGeo = ribbonGeometry(samplePath(trackPoints, 90), 4.6, 0.12);
    ctx.world.add(new THREE.Mesh(trackGeo, deckMat));
    // Guideway rails glow.
    for (const off of [-1.7, 1.7]) {
      const pts = trackPoints.map((p) => ({ ...p, x: p.x + off, y: p.y + 0.18 }));
      ctx.world.add(new THREE.Mesh(ribbonGeometry(samplePath(pts, 90), 0.18, 0.05), railGlow));
    }
    // Pillars.
    for (let i = 4; i < trackPoints.length - 4; i += 3) {
      const p = trackPoints[i];
      const g = hf.heightAt(p.x, p.z);
      if (p.y - g > 2) ctx.box(stoneMat, 2.2, p.y - g, 2.2, p.x, g, p.z);
    }
    ctx.trafficPath(trackPoints, { speed: 22, offset: 0.5, count: 10, color: '#bfe8ff' });

    // Train — three lit carriages moving along the guideway.
    const trainCurve = new THREE.CatmullRomCurve3(trackPoints.map((p) => new THREE.Vector3(p.x, p.y + 1.6, p.z)));
    const trainMat = ctx.mat('train', { color: '#e2ebf0', roughness: 0.3, metalness: 0.55 });
    const trainGlow = ctx.glow('train-glow', '#bfe9ff', 0.95, 2.6);
    const cars = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 13), trainMat);
      body.position.y = 1.7;
      g.add(body);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4.08, 0.8, 11.4), trainGlow);
      strip.position.y = 2.4;
      g.add(strip);
      if (i === 2) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), ctx.glow('train-head', '#e8f8ff', 1, 3));
        head.position.set(0, 2.2, 6.4);
        g.add(head);
      }
      ctx.world.add(g);
      cars.push(g);
    }
    let trainT = 0.9;
    const tmpPoint = new THREE.Vector3();
    const tmpTangent = new THREE.Vector3();
    ctx.ticker((elapsed, dt) => {
      trainT = (trainT + dt * 0.011) % 1;
      for (let i = 0; i < cars.length; i++) {
        const t = (trainT - i * 0.012 + 1) % 1;
        const p = trainCurve.getPointAt(t, tmpPoint);
        const tan = trainCurve.getTangentAt(t, tmpTangent);
        cars[i].position.copy(p);
        cars[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      }
    });

    // Station sign.
    const stationTex = ctx.addTexture(makeTextTexture('李子坝', {
      width: 320, height: 120, color: '#eaf8ff', glow: '#43b7ff',
      font: '600 62px "Microsoft YaHei", "PingFang SC", sans-serif',
    }));
    const stationMat = new THREE.MeshBasicMaterial({ map: stationTex, transparent: true, side: THREE.DoubleSide });
    const station = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.9), stationMat);
    station.position.set(monX, trackY + 6.2, monZ + 8.2);
    ctx.world.add(station);
    ctx.label('李子坝', '轻轨穿楼 · 2 号线', monX, trackY + 12, monZ);

    // ------- Raffles City leaning towers -------
    const rfX = 16;
    const rfZ = 78;
    const rfBase = hf.heightAt(rfX, rfZ) + 1;
    const rfGlass = ctx.mat('raffles', { color: '#6f8fa8', roughness: 0.28, metalness: 0.45 });
    const rfGlow = ctx.glow('raffles-edge', '#9fd8ff', 0.7, 1.8);
    const rfColumns = [[-16, 0], [0, -4], [16, 0], [0, 16]];
    for (let ti = 0; ti < 4; ti++) {
      const [ox, oz] = rfColumns[ti];
      let px = rfX + ox;
      let pz = rfZ + oz;
      const segH = 12.5;
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const shrink = 1 - s * 0.055;
        px += (rfX - px) * 0.06 + (ox > 0 ? -0.5 : ox < 0 ? 0.5 : 0);
        pz += (rfZ - pz) * 0.06;
        ctx.addBuilding('mega', mega, {
          x: px, y: rfBase + s * segH, z: pz,
          w: 11 * shrink, h: segH + 0.6, d: 11 * shrink,
          color: '#7f9db2', lit: 0.55, seed: rng.next(), variant: rng.next(),
          // The leaning-tower stack is its own stepped silhouette.
          roof: false,
        });
      }
      ctx.lamp(px, rfBase + segs * segH + 2, pz, '#9fd8ff', 1.2);
      // Vertical light edge.
      ctx.box(rfGlow, 0.5, segs * segH, 0.5, px + 5, rfBase, pz);
    }
    const skybridgeY = rfBase + 52;
    ctx.box(rfGlass, 20, 4.4, 6, rfX, skybridgeY, rfZ - 2);
    ctx.label('来福士', '朝天门 · 扬帆起航', rfX, rfBase + 108, rfZ);

    // ------- CBD towers + Jiefangbei -------
    const cbdTowers = [
      { x: -6, z: 18, w: 18, d: 18, h: 142 },
      { x: 42, z: 6, w: 15, d: 15, h: 122 },
      { x: -44, z: -6, w: 16, d: 20, h: 112 },
      { x: 24, z: 34, w: 13, d: 13, h: 98 },
      { x: -20, z: 52, w: 14, d: 14, h: 92 },
      { x: 64, z: 54, w: 12, d: 12, h: 84 },
    ];
    for (const t of cbdTowers) {
      const gy = hf.heightAt(t.x, t.z);
      place(t.x, t.z, t.w, t.d, t.h, '#8aa6b8', mega, 'mega', { foundation: true, lit: 0.55 });
      ctx.box(glowWarm, t.w + 1, 0.55, t.d + 1, t.x, gy + t.h, t.z);
    }
    // Jiefangbei monument.
    const jx = 30;
    const jz = 20;
    const jy = hf.heightAt(jx, jz);
    ctx.box(stoneMat, 5, 27, 5, jx, jy, jz);
    ctx.box(stoneMat, 7.5, 2.5, 7.5, jx, jy + 27, jz);
    ctx.box(neonSign, 7.6, 0.6, 7.6, jx, jy + 29.6, jz);
    ctx.label('解放碑', '渝中半岛 · 城市原点', jx, jy + 34, jz);

    // ------- Generic hillside city -------
    const north = 150;
    const south = 138;
    const west = -250;
    const east = 260;
    const spacing = 12.5 / Math.sqrt(Math.max(0.25, params.density));
    const reserved = [
      [98, 92, 44], [-26, 8, 24], [158, 46, 58], [16, 78, 32], [30, 20, 26], [146, 150, 40], [-126, 80, 30],
    ];
    const isReserved = (x, z, r = 0) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + r);

    for (let x = west; x <= east; x += spacing) {
      for (let z = -220; z <= north; z += spacing) {
        if (isReserved(x, z)) continue;
        if (x < -160 && z > 120 && z < 190) continue;
        const jx2 = x + rng.range(-spacing * 0.32, spacing * 0.32);
        const jz2 = z + rng.range(-spacing * 0.32, spacing * 0.32);
        const gh = hf.heightAt(jx2, jz2);
        if (gh < 1.2) continue;
        if (hf.slopeAt(jx2, jz2) > 0.62) continue;
        const perCell = rng.next() < 0.55 ? 2 : 1;
        for (let k = 0; k < perCell; k++) {
          const bx = jx2 + rng.range(-4.5, 4.5);
          const bz = jz2 + rng.range(-4.5, 4.5);
          const gh2 = hf.heightAt(bx, bz);
          if (gh2 < 1.2 || hf.slopeAt(bx, bz) > 0.66) continue;
          const dc = Math.hypot(bx - 20, bz - 6);
          const cbd = Math.exp(-(dc * dc) / (2 * 105 * 105));
          const kind = pickKind();
          const hv = 1 + (rng.next() - 0.5) * params.heightVar * 1.5;
          let h;
          let w;
          let d;
          let key;
          let material;
          let color;
          if (cbd > 0.45 && rng.next() < 0.34 && params.commercial > 0.2) {
            key = 'glass';
            material = glass;
            color = colorOf('glass');
            w = rng.range(10, 17);
            d = rng.range(10, 17);
            h = clamp(rng.range(36, 92) * cbd * hv * (0.55 + params.avgHeight), 22, 150);
          } else if (kind === 'glass') {
            key = 'glass';
            material = glass;
            color = colorOf('glass');
            w = rng.range(9, 16);
            d = rng.range(9, 16);
            h = clamp(rng.range(30, 70) * hv * params.avgHeight, 16, 120);
          } else if (kind === 'old') {
            key = 'old';
            material = old;
            color = colorOf('old');
            w = rng.range(9, 16);
            d = rng.range(8, 14);
            h = clamp(rng.range(8, 20) * (0.7 + params.avgHeight * 0.4), 5, 30);
          } else {
            key = 'res';
            material = res;
            color = colorOf('res');
            w = rng.range(8, 15);
            d = rng.range(8, 14);
            h = clamp(rng.range(16, 48) * hv * (0.7 + params.avgHeight * 0.5), 8, 80);
          }
          place(bx, bz, w, d, h, color, material, key);
        }
      }
    }

    // South bank low-rise foreground.
    for (let x = -300; x <= 300; x += 26) {
      const z = 228 + rng.range(-18, 18);
      if (Math.abs(x) < 110) continue;
      const h = rng.range(12, 34);
      place(x, z, rng.range(12, 20), rng.range(10, 18), h, colorOf('res'), res, 'res', { foundation: false });
    }
    // A small south-bank village and a lit road in the foreground.
    addRoad(ctx, terrainPath([[-340, 300], [-120, 292], [100, 296], [340, 312]]), {
      width: 8, lamps: true, lampSpacing: 24, divisions: 80,
    });
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-360, 360);
      const z = rng.range(270, 380);
      const gh = hf.heightAt(x, z);
      if (gh < 2) continue;
      place(x, z, rng.range(9, 15), rng.range(8, 13), rng.range(8, 18), colorOf('res'), res, 'res', { foundation: false });
    }
    // Warm light pools on the south-bank hillside.
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = 128;
    poolCanvas.height = 128;
    const pctx = poolCanvas.getContext('2d');
    const pgrad = pctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    pgrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    pgrad.addColorStop(0.45, 'rgba(255,255,255,0.32)');
    pgrad.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = pgrad;
    pctx.fillRect(0, 0, 128, 128);
    const poolTex = ctx.addTexture(new THREE.CanvasTexture(poolCanvas));
    poolTex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-380, 380);
      const z = rng.range(240, 430);
      const y = hf.heightAt(x, z) + 0.2;
      const mat = new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
        depthWrite: false, color: new THREE.Color('#ff9a55'),
      });
      mat.userData.disposeOnClear = true;
      ctx.materials.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(50, 120), rng.range(40, 90)), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x, y, z);
      ctx.world.add(plane);
      ctx.lamp(x, y + 0.5, z, '#ffb060', 1.1);
    }

    // Trees and parks on the hills.
    for (let i = 0; i < 220 * params.parks * 4; i++) {
      const x = rng.range(-520, 520);
      const z = rng.range(-520, 520);
      const gh = hf.heightAt(x, z);
      if (gh < 2) continue;
      if (hf.slopeAt(x, z) > 0.7) continue;
      if (isReserved(x, z, 6)) continue;
      if (rng.chance(0.5)) continue;
      ctx.tree(x, gh, z, rng.range(0.75, 1.25), rng.chance(0.3) ? 'pine' : 'round', rng.chance(0.5) ? '#4d7042' : '#3f6239');
    }
    // A few foreground hillside trees on the south bank.
    for (let i = 0; i < 130; i++) {
      const x = rng.range(-420, 420);
      const z = rng.range(230, 540);
      const gh = hf.heightAt(x, z);
      ctx.tree(x, gh, z, rng.range(1.0, 1.9), rng.chance(0.5) ? 'pine' : 'round', '#3f5c3a');
    }

    // Boats on the Yangtze.
    const boatPath = [[-260, 156], [-100, 150], [60, 158], [260, 172]].map(([x, z]) => new THREE.Vector3(x, 2.6, z));
    const boatCurve = new THREE.CatmullRomCurve3(boatPath);
    const boatMat = ctx.mat('boat', { color: '#5a6066', roughness: 0.7 });
    const boatGlow = ctx.glow('boat-glow', '#ffd28a', 1, 2.8);
    const boats = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 4), boatMat);
      g.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 3.2), boatMat);
      cabin.position.y = 1.9;
      g.add(cabin);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), boatGlow);
      light.position.set(4, 1.6, 0);
      g.add(light);
      ctx.world.add(g);
      boats.push({ g, off: rng.next() });
    }
    ctx.ticker((elapsed) => {
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        const t = (elapsed * 0.008 + b.off) % 1;
        const p = boatCurve.getPointAt(t);
        const tan = boatCurve.getTangentAt(t);
        b.g.position.copy(p);
        b.g.rotation.y = Math.atan2(tan.x, tan.z);
      }
    });

    // Distant glimmer towers across the river (south bank skyline).
    ctx.traffic.setNight(1);
  },
};
