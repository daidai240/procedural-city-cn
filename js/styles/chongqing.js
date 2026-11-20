import * as THREE from 'three';
import { makeFbm2D, smoothstep, clamp } from '../rng.js';
import { Heightfield, distToPolyline } from '../terrain.js';
import { ribbonGeometry, samplePath, hipRoofGeometry, makeTextTexture } from '../geom.js';
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
    skyTop: '#3a4666', skyHorizon: '#f0a06a', skyBottom: '#6b5b60', sunColor: '#ffb87e',
    fogColor: '#a09694', hemiSky: '#8ea8c8', hemiGround: '#30343a', horizonGlow: '#ff8a4a',
    waterDeep: '#2f343e', waterShallow: '#5a5a64', sunIntensity: 0.85, hemiIntensity: 0.9,
  },
  night: {
    skyTop: '#081120', skyHorizon: '#1b2b3d', skyBottom: '#0a121b', sunColor: '#9fb8d8',
    fogColor: '#0d1620', hemiSky: '#3a5578', hemiGround: '#30343c', horizonGlow: '#7a2a12',
    waterDeep: '#07131a', waterShallow: '#1c343c', sunIntensity: 0.5, hemiIntensity: 0.95,
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
  fogScale: 0.72,
  exposure: 1.1,
  waterReflect: 0.5,
  env: PALETTE,
  patterns: [
    { value: 'organic', label: '依山就势' },
    { value: 'grid', label: '棋盘街区' },
    { value: 'radial', label: '环状放射' },
  ],
  defaults: {
    density: 0.9, block: 0.85, avgHeight: 0.9, heightVar: 0.72,
    commercial: 0.44, residential: 0.46, industrial: 0.1,
    water: 0.9, parks: 0.12, terrain: 0.85, time: 0.68, fog: 0.42,
  },
  views: [
    { key: 'south', label: '南岸全景', pos: [170, 240, 540], target: [8, 55, 20] },
    { key: 'hongya', label: '洪崖洞', pos: [30, 62, 210], target: [98, 34, 88] },
    { key: 'monorail', label: '李子坝', pos: [-110, 105, 80], target: [-26, 94, 8] },
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
      // The peninsula spine: a real north-south ridge that the city has to
      // climb. This is what turns a flat grid into a mountain city; terraces
      // are cut into its flanks below.
      const ridge = Math.exp(-((x - 20) ** 2) / (2 * 95 * 95)) *
        smoothstep(220, 60, Math.abs(z - 20)) * 32 * (0.35 + params.terrain * 0.85);
      h += ridge;
      const cbd = Math.exp(-((x - 20) ** 2 + (z - 6) ** 2) / (2 * 120 * 120));
      h += cbd * 10 * (0.4 + params.terrain);
      h += smoothstep(-80, -260, z) * 18 * params.terrain;
      h += smoothstep(210, 330, Math.abs(x)) * 10;
      // Fade the high-frequency ripple out towards the horizon so the distant
      // terrain silhouette stays smooth instead of breaking into jagged folds.
      const farMask = smoothstep(230, 560, Math.hypot(x, z));
      h += (fbm2(x * 0.03, z * 0.03) - 0.5) * 5 * (1.0 - farMask * 0.9);
      const bank = smoothstep(0, 34, dRiver);
      h = -7 + (h + 7) * Math.pow(bank, 0.72);
      if (bank > 0.96) h = Math.max(h, 1.4);
      // Explicit terraces: quantise the slope into ~4.8 m shelves with a short
      // ramp, so the hillside reads as countable layers from the river rather
      // than one smooth green mound.
      if (bank > 0.955 && h > 3.2) {
        const step = 4.8;
        const t = h / step;
        const f = t - Math.floor(t);
        // Wide green treads with a short riser: the layers are countable but
        // most of the hillside stays planted, not bare rock.
        h = (Math.floor(t) + smoothstep(0.62, 0.85, f)) * step;
      }
      return h;
    };

    const colorFn = (x, z, h, slope, noise) => {
      if (h < 0.4) return '#4a564d';
      const n = noise(x * 0.04, z * 0.04);
      if (slope > 0.72) {
        return n > 0.5 ? '#6a665c' : '#5c594f';
      }
      const green = n > 0.55 ? '#4b6b3e' : n > 0.3 ? '#547447' : '#3f5c36';
      const urban = smoothstep(60, 10, Math.hypot(x - 20, z - 6));
      if (urban > 0.35 && n > 0.4) return '#4c4b45';
      return green;
    };

    const hf = new Heightfield({ size: 1200, segments: 300, heightFn, colorFn });
    ctx.terrainSegments = hf.segments;
    ctx.bindTerrain(hf);
    const terrainMat = ctx.nightSurface('terrain', {
      color: '#ffffff', roughness: 0.97, metalness: 0.0,
      sheen: 0.34, nightLift: '#1c2734', nightLiftScale: 0.72,
    });
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
    const roofMat = ctx.mat('roof', { color: '#22262a', roughness: 0.92 });
    const stoneMat = ctx.mat('stone', { color: '#5a5952', roughness: 0.92 });
    const deckMat = ctx.mat('deck', { color: '#2a2d31', roughness: 0.78 });
    const metalMat = ctx.mat('metal', { color: '#9aa4ad', roughness: 0.35, metalness: 0.75 });
    const glowWarm = ctx.glow('glow-warm', '#ffb35a', 1, 2.6);
    const beaconMat = ctx.glow('beacon', '#ff3a2c', 1, 2.8);
    const neonSign = ctx.glow('neon-sign', '#ff8a3d', 1, 2.2);

    const unitGlow = new THREE.BoxGeometry(1, 1, 1);
    unitGlow.translate(0, 0.5, 0);
    const antGeo = new THREE.BoxGeometry(1, 1, 1);
    antGeo.translate(0, 0.5, 0);
    const antBatch = ctx.instance('antenna', antGeo, metalMat);
    const beaconGeo = new THREE.SphereGeometry(0.6, 8, 6);
    const beaconBatch = ctx.instance('beacons', beaconGeo, beaconMat);

    // ------- helper: place one building with a slope foundation -------
    const place = (x, z, w, d, h, color, material, batchKey, opts = {}) => {
      // Sample the footprint and build a stone foundation down past the lowest
      // corner; the exposed part becomes a retaining wall with a 0.6 m cap.
      const base = ctx.foundation(x, z, w, d, { margin: 0.4 });
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

    // ------- stepped river embankments -------
    // Chongqing's river banks are stairs down to the water, not a smooth wall.
    const stepMat = ctx.mat('river-step', { color: '#ffffff', roughness: 0.95 });
    const stepBatch = ctx.instance('river-steps', unitGlow.clone(), stepMat);
    const addBankSteps = (line, halfWidth) => {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        const segLen = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(segLen / 15));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          const dx = bx - ax;
          const dz = bz - az;
          const len = Math.hypot(dx, dz) || 1;
          const nx = dz / len;
          const nz = -dx / len;
          const rot = Math.atan2(dx, dz);
          for (const side of [-1, 1]) {
            for (let s = 0; s < 4; s++) {
              const off = halfWidth + 0.4 + s * 1.15;
              stepBatch.add({
                x: x + nx * off * side, y: 1.35 - s * 0.32, z: z + nz * off * side,
                w: 1.35, h: 0.3, d: segLen / steps + 0.3, rotY: rot,
                color: s % 2 === 0 ? '#7b786e' : '#6c6a61',
              });
            }
          }
        }
      }
    };
    addBankSteps(YANGTZE, halfYangtze);
    addBankSteps(JIALING, halfJialing);

    const switchbacks = [
      [[-110, 116], [-60, 78], [20, 92], [78, 48], [20, 14], [72, -24], [12, -70], [58, -118], [-4, -156]],
      [[-96, -190], [-44, -150], [26, -176], [64, -112], [4, -82], [48, -24], [-18, 18], [-84, -26], [-60, -92]],
      [[110, 100], [140, 42], [102, 4], [150, -44], [98, -88], [126, -156]],
    ];
    for (const raw of switchbacks) {
      addRoad(ctx, terrainPath(raw), { width: 8, lamps: true, lampSpacing: 21, divisions: 110, speed: 9 });
    }

    // Elevated expressway through the hills, following the new ridge.
    const viaductRaw = [[-320, 46], [-190, 30], [-80, 58], [40, 44], [170, 66], [320, 92]];
    const viaductPts = viaductRaw.map(([x, z]) => ({ x, z, y: hf.heightAt(x, z) + 16 }));
    const viaduct = addRoad(ctx, viaductPts, {
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
    // Solid cable stays: a dozen real cylinders per pylon instead of a dense
    // line fan. They stay below the bloom threshold, so no white starburst at
    // any camera distance.
    const cableGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
    const cableMat = ctx.mat('bridge-cable', {
      color: '#ffffff', roughness: 0.55, metalness: 0.25,
      emissive: '#161c22', emissiveIntensity: 1,
    });
    const cableBatch = ctx.instance('bridge-cables', cableGeo, cableMat);
    const addCable = (ax, ay, az, bx, by, bz) => {
      const a = new THREE.Vector3(ax, ay, az);
      const b = new THREE.Vector3(bx, by, bz);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 0.01) return;
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.normalize()
      );
      cableBatch.add({
        x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2,
        w: 0.36, h: len, d: 0.36, quaternion: q, color: '#c8d0d8',
      });
    };

    const buildCableBridge = (cx, z0, z1, deckY, pylonH) => {
      const span = Math.abs(z1 - z0);
      const midZ = (z0 + z1) / 2;
      const deckH = 2.4;
      // Solid box girder with side parapets.
      ctx.box(deckMat, 13, deckH, span, cx, deckY - deckH, midZ);
      for (const sx of [-1, 1]) {
        ctx.box(stoneMat, 0.7, 1.4, span, cx + sx * 6.2, deckY, midZ);
      }
      // Piers standing in the river.
      for (const f of [0.18, 0.5, 0.82]) {
        const pz = z0 + span * f;
        const bed = hf.heightAt(cx, pz);
        const top = deckY - deckH;
        if (top - bed > 2) ctx.box(stoneMat, 7.5, top - bed, 8.5, cx, bed, pz);
      }
      const beacons = [];
      for (const f of [0.33, 0.67]) {
        const pz = z0 + span * f;
        const topY = deckY + pylonH;
        for (const sx of [-1, 1]) {
          ctx.box(stoneMat, 2.4, pylonH + 2, 2.4, cx + sx * 5.2, deckY - 2, pz);
        }
        ctx.box(stoneMat, 11.2, 2.0, 2.6, cx, topY - 5.2, pz);
        ctx.box(stoneMat, 12.6, 1.1, 3.0, cx, topY - 0.7, pz);
        // Twelve stays per pylon: three deck anchors on each side of each
        // cable plane. A readable fan, not a starburst.
        for (const sx of [-1, 1]) {
          for (const side of [-1, 1]) {
            for (let k = 1; k <= 3; k++) {
              const anchorZ = pz + side * span * 0.085 * k;
              addCable(cx + sx * 6.2, deckY + 0.2, anchorZ, cx + sx * 5.2, topY - 1.4, pz);
            }
          }
        }
        beacons.push({ x: cx, y: topY + 0.6, z: pz });
      }
      for (const b of beacons) ctx.lamp(b.x, b.y, b.z, '#ff6a5a', 0.9);
      ctx.trafficPath(samplePath([
        { x: cx, y: deckY + 0.4, z: z0 },
        { x: cx, y: deckY + 0.4, z: midZ },
        { x: cx, y: deckY + 0.4, z: z1 },
      ], 40), { speed: 16, offset: 4, count: 20 });
    };

    buildCableBridge(146, 94, 214, 13, 52);
    buildCableBridge(-126, 24, 146, 12, 46);

    // ------- Huangjuewan-style stacked interchange -------
    // Four concentric decks eight metres apart, crossed by three flyovers at
    // in-between levels, plus two 270-degree spiral ramps. Columns stop at the
    // deck above them and are skipped where they would pierce a lower deck.
    const icx = 158;
    const icz = 46;
    const icRings = [
      { radius: 34, layer: 0, width: 7 },
      { radius: 50, layer: 1, width: 7 },
      { radius: 66, layer: 2, width: 6.5 },
      { radius: 24, layer: 3, width: 6 },
    ];
    const icStraights = [
      { off: -30, yOff: 12, layer: 0 },
      { off: 0, yOff: 20, layer: 1 },
      { off: 30, yOff: 28, layer: 2 },
    ];
    let baseIC = -Infinity;
    for (const ring of icRings) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        baseIC = Math.max(baseIC, hf.heightAt(icx + Math.cos(a) * ring.radius, icz + Math.sin(a) * ring.radius));
      }
    }
    for (const s of icStraights) {
      for (const dx of [-84, -42, 0, 42, 84]) {
        baseIC = Math.max(baseIC, hf.heightAt(icx + dx, icz + s.off));
      }
    }
    baseIC += 4;
    const icY = (layer) => baseIC + 8 + layer * 8;
    const icBox = new THREE.BoxGeometry(1, 1, 1);
    icBox.translate(0, 0.5, 0);
    const icDeckMats = [0, 1, 2, 3].map((i) => ctx.mat(`ic-deck-${i}`, {
      color: ['#3b4249', '#4a525b', '#5a6470', '#6b7683'][i],
      roughness: 0.56, metalness: 0.16,
    }));
    const icPierMat = ctx.mat('ic-pier', { color: '#ffffff', roughness: 0.92 });
    const icPierBatch = ctx.instance('ic-piers', icBox, icPierMat);
    const icDeckBatches = icDeckMats.map((m, i) => ctx.instance(`ic-deck-${i}`, icBox, m));

    const pierBlocked = (x, z, deckY) => {
      for (const ring of icRings) {
        if (icY(ring.layer) >= deckY) continue;
        if (Math.abs(Math.hypot(x - icx, z - icz) - ring.radius) < 4.2) return true;
      }
      for (const s of icStraights) {
        if (baseIC + s.yOff >= deckY) continue;
        if (Math.abs(z - (icz + s.off)) < 4.6 && Math.abs(x - icx) < 84) return true;
      }
      return false;
    };
    const addPier = (x, z, deckY) => {
      const ground = hf.heightAt(x, z);
      if (deckY - ground < 2.5 || pierBlocked(x, z, deckY)) return;
      icPierBatch.add({ x, y: ground, z, w: 1.9, h: deckY - ground, d: 1.9, color: '#8d8f88' });
      icPierBatch.add({ x, y: deckY - 0.6, z, w: 3.6, h: 0.6, d: 3.6, color: '#a5a69c' });
    };

    const addInterchangeRing = (ring) => {
      const { radius, layer, width } = ring;
      const y = icY(layer);
      const batch = icDeckBatches[layer];
      const segments = 72;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = { x: icx + Math.cos(a0) * radius, z: icz + Math.sin(a0) * radius };
        const p1 = { x: icx + Math.cos(a1) * radius, z: icz + Math.sin(a1) * radius };
        const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        batch.add({
          x: (p0.x + p1.x) / 2, y: y - 0.9, z: (p0.z + p1.z) / 2,
          w: width, h: 0.9, d: len + 0.25,
          rotY: Math.atan2(p1.x - p0.x, p1.z - p0.z), color: '#ffffff',
        });
      }
      for (let i = 0; i < segments; i += 9) {
        const a = (i / segments) * Math.PI * 2;
        addPier(icx + Math.cos(a) * radius, icz + Math.sin(a) * radius, y - 0.9);
      }
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push({ x: icx + Math.cos(a) * radius, y: y + 0.1, z: icz + Math.sin(a) * radius });
      }
      ctx.trafficPath(pts, { speed: 11 + layer * 2, offset: 2.0, count: 14 });
      for (let i = 0; i < segments; i += 8) {
        const a = (i / segments) * Math.PI * 2;
        ctx.lamp(icx + Math.cos(a) * radius, y + 1.3, icz + Math.sin(a) * radius, '#ffd8a0', 0.85);
      }
    };
    for (const ring of icRings) addInterchangeRing(ring);

    for (const s of icStraights) {
      const y = baseIC + s.yOff;
      const z = icz + s.off;
      icDeckBatches[s.layer].add({
        x: icx, y: y - 0.9, z, w: 168, h: 0.9, d: 7, color: '#ffffff',
      });
      for (let dx = -78; dx <= 78; dx += 26) addPier(icx + dx, z, y - 0.9);
      ctx.trafficPath([
        { x: icx - 84, y: y + 0.1, z },
        { x: icx, y: y + 0.1, z },
        { x: icx + 84, y: y + 0.1, z },
      ], { speed: 14, offset: 2.2, count: 16 });
      for (let dx = -78; dx <= 78; dx += 20) {
        ctx.lamp(icx + dx, y + 1.3, z + 3.2, '#ffd8a0', 0.9);
      }
    }

    const addSpiral = (fromLayer, radius, startAngle) => {
      const y0 = icY(fromLayer);
      const y1 = icY(fromLayer + 1);
      const pts = [];
      const segs = 54;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const a = startAngle + t * Math.PI * 2 * 0.75;
        pts.push({ x: icx + Math.cos(a) * radius, y: y0 + (y1 - y0) * t, z: icz + Math.sin(a) * radius });
      }
      const geo = ribbonGeometry(pts, 5.2, 0.08);
      ctx.world.add(new THREE.Mesh(geo, icDeckMats[fromLayer + 1]));
      for (let i = 4; i <= segs; i += 9) {
        const p = pts[i];
        addPier(p.x, p.z, p.y - 0.5);
      }
      ctx.trafficPath(pts, { speed: 9, offset: 1.7, count: 12 });
    };
    addSpiral(0, 42, 0.35);
    addSpiral(1, 58, 2.35);
    ctx.label('黄桷湾立交', '四层叠环 · 8D 魔幻', icx, icY(3) + 18, icz);

    // ------- Hongyadong stilt-house tiers -------
    const hongX = 98;
    const hongZ = 92;
    const hongBase = hf.heightAt(hongX, hongZ);
    const hongWall = ctx.facade('hongya-wall', {
      winA: '#ffd9a0', winB: '#ffbf7a', floorH: 3.4, colW: 3.4, lit: 0.35,
      roughness: 0.92, metalness: 0.0, glow: 0.9,
    });
    const hongWood = ctx.mat('hongya-wood', { color: '#ffffff', roughness: 0.88, metalness: 0.02 });
    const hongRoof = ctx.mat('hongya-roof', { color: '#2c3942', roughness: 0.7, metalness: 0.14 });
    const hongLantern = ctx.glow('hongya-lantern', '#ffb15e', 0.95, 2.2);
    const hongWoodBatch = ctx.instance('hongya-wood', unitGlow.clone(), hongWood);
    const hongRoofBatch = ctx.instance('hongya-roofs', hipRoofGeometry(1, 0.17, 0.24), hongRoof);
    const hongStiltGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
    hongStiltGeo.translate(0, 0.5, 0);
    const hongStiltBatch = ctx.instance('hongya-stilts', hongStiltGeo, hongWood);
    const hongLanternBatch = ctx.instance('hongya-lanterns', unitGlow.clone(), hongLantern);
    const wood = (x, y, z, w, h, d, rotZ = 0) => hongWoodBatch.add({
      x, y, z, w, h, d, rotZ, color: '#43301f',
    });

    let hongRowY = hongBase + 1.4;
    for (let row = 0; row < 5; row++) {
      const rowZ = hongZ - row * 10.2;
      const groundY = hf.heightAt(hongX, rowZ);
      // Each row steps up and back, sitting on its own stone terrace.
      const rowY = Math.max(groundY + 2.0, hongRowY + 3.2);
      hongRowY = rowY;
      ctx.foundation(hongX, rowZ, 76, 12, {
        base: rowY, margin: 0, color: '#5f5a4e', capColor: '#867f70',
      });
      wood(hongX, rowY - 0.7, rowZ + 6.0, 76, 0.7, 0.5); // deck fascia
      for (let col = 0; col < 7; col++) {
        const hx = hongX - 28.8 + col * 9.6;
        const w = 7.8;
        const d = 7.2;
        const h = 9.6 + (col % 2) * 1.1 + row * 0.25;
        const hz = rowZ + 4.4;
        ctx.addBuilding('hongya-walls', hongWall, {
          x: hx, y: rowY, z: hz, w, h, d,
          color: rng.pick(['#efe6d6', '#e7dccb', '#f3ecdf']),
          lit: 0.4, seed: rng.next(), variant: rng.next(),
          roof: false,
        });
        // Timber frame: corner posts, floor beams and a balcony per floor.
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            wood(hx + sx * (w / 2 - 0.2), rowY, hz + sz * (d / 2 - 0.2), 0.32, h, 0.32);
          }
        }
        const floors = Math.max(2, Math.floor(h / 3.1));
        for (let f = 0; f <= floors; f++) {
          const by = rowY + Math.min(h, f * 3.1);
          wood(hx, by, hz + d / 2 + 0.16, w, 0.26, 0.3);
          if (f > 0 && f < floors) {
            wood(hx, by, hz + d / 2 + 0.75, w * 0.96, 0.18, 1.4); // balcony deck
            wood(hx, by + 0.9, hz + d / 2 + 1.38, w * 0.9, 0.16, 0.16); // handrail
            for (let b = -2; b <= 2; b++) {
              wood(hx + b * w * 0.19, by, hz + d / 2 + 1.38, 0.12, 0.9, 0.12);
            }
          }
        }
        // Stilts down to the slope below the terrace.
        for (const sx of [-1, -0.34, 0.34, 1]) {
          const px = hx + sx * (w / 2 - 0.5);
          const pz = hz + d / 2 + 0.55;
          const gy = hf.heightAt(px, pz);
          const len = rowY - gy + 0.5;
          if (len > 1.2) {
            hongStiltBatch.add({ x: px, y: gy, z: pz, w: 0.3, h: len, d: 0.3, color: '#4a3626' });
          }
        }
        // Hip roof with a 1.5 m eave and an upturned ridge.
        const roofY = rowY + h;
        hongRoofBatch.add({ x: hx, y: roofY, z: hz, w, h: 2.9, d, color: '#ffffff' });
        wood(hx, roofY, hz, w * 1.16, 0.22, d * 1.16); // eave board
        wood(hx, roofY + 2.82, hz, w * 0.56, 0.32, 0.42); // ridge
        for (const sx of [-1, 1]) {
          wood(hx + sx * w * 0.3, roofY + 2.96, hz, 1.7, 0.2, 0.34, sx * 0.34);
        }
        // Two warm lanterns under the eave instead of a strip per floor.
        for (const sx of [-1, 1]) {
          hongLanternBatch.add({
            x: hx + sx * w * 0.3, y: roofY - 0.55, z: hz + d / 2 + 0.4,
            w: 0.42, h: 0.42, d: 0.42, color: '#ffffff',
          });
        }
      }
      // A few real warm point lights wash the lower retaining walls.
      if (row < 2) {
        for (const col of [1, 5]) {
          const light = new THREE.PointLight('#ffb060', 22, 24, 2);
          light.position.set(hongX - 28.8 + col * 9.6, rowY + 3.6, rowZ + 5.6);
          ctx.world.add(light);
        }
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
    sign.position.set(hongX + 42, hongBase + 20, hongZ + 8);
    sign.rotation.y = Math.PI;
    ctx.world.add(sign);
    ctx.label('洪崖洞', '吊脚楼 · 千与千寻', hongX, hongRowY + 12, hongZ + 4);
    // Keep the landmark camera framed against the rebuilt tiers.
    ctx.style.views[1].pos = [hongX - 68, hongRowY + 26, hongZ + 120];
    ctx.style.views[1].target = [hongX, hongRowY - 6, hongZ];

    // ------- Liziba monorail through a building -------
    const monX = -26;
    const monZ = 8;
    const monBase = ctx.foundation(monX, monZ, 28, 15, { margin: 0.6 });
    // 5.6 m wide / 12 m tall opening: 0.8 m clear on each side of the 4 m car.
    const openW = 5.6;
    const openH = 12;
    const lowerH = 18;
    const upperY = monBase + lowerH + openH;
    const trackY = monBase + lowerH + 4.0;
    ctx.addBuilding('res', res, {
      x: monX, y: monBase, z: monZ, w: 28, h: lowerH, d: 15,
      color: '#b8aa96', lit: 0.85, seed: rng.next(), variant: 0.6, roof: false,
    });
    ctx.addBuilding('res', res, {
      x: monX, y: upperY, z: monZ, w: 28, h: 20, d: 15,
      color: '#b8aa96', lit: 0.85, seed: rng.next(), variant: 0.6, roof: false,
    });
    // Side walls framing the opening.
    const sideW = (28 - openW) / 2;
    for (const sx of [-1, 1]) {
      ctx.box(stoneMat, sideW, openH, 15, monX + sx * (openW / 2 + sideW / 2), monBase + lowerH, monZ);
    }
    // Concrete trim around both portal faces.
    const trimMat = ctx.mat('portal-trim', { color: '#b6b2a8', roughness: 0.9 });
    for (const dz of [-1, 1]) {
      const zFace = monZ + dz * 7.55;
      ctx.box(trimMat, openW + 1.6, 0.6, 0.5, monX, monBase + lowerH + openH - 0.2, zFace);
      ctx.box(trimMat, openW + 1.6, 0.6, 0.5, monX, monBase + lowerH + 0.2, zFace);
      for (const sx of [-1, 1]) {
        ctx.box(trimMat, 0.5, openH, 0.5, monX + sx * (openW / 2 + 0.25), monBase + lowerH + 0.5, zFace);
      }
    }
    // Roof + stair tower.
    ctx.box(roofMat, 29.4, 1.4, 16.4, monX, upperY + 20, monZ);
    ctx.box(stoneMat, 4, 3, 4, monX - 8, upperY + 21.4, monZ + 3);

    const trackPoints = [];
    for (let z = -170; z <= 120; z += 10) {
      trackPoints.push({ x: monX, y: trackY, z });
    }
    // Solid box-girder guideway: 2.6 m wide x 1.8 m tall, not a flat ribbon.
    const guideSamples = samplePath(trackPoints, 120);
    const guideMat = ctx.mat('guideway', { color: '#ffffff', roughness: 0.78, metalness: 0.08 });
    const guideGeo = new THREE.BoxGeometry(1, 1, 1);
    guideGeo.translate(0, 0.5, 0);
    const guideBatch = ctx.instance('guideway', guideGeo, guideMat);
    for (let i = 0; i < guideSamples.length - 1; i++) {
      const a = guideSamples[i];
      const b = guideSamples[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) + 0.3;
      guideBatch.add({
        x: (a.x + b.x) / 2, y: trackY, z: (a.z + b.z) / 2,
        w: 2.6, h: 1.8, d: len, rotY: Math.atan2(dx, dz), color: '#a2a39b',
      });
    }
    // Piers every 18 m with a cap beam under the girder.
    const pierMat = ctx.mat('pier', { color: '#ffffff', roughness: 0.9 });
    const pierBatch = ctx.instance('guide-piers', guideGeo.clone(), pierMat);
    let pierRun = 0;
    for (let i = 1; i < guideSamples.length; i++) {
      pierRun += guideSamples[i].distanceTo(guideSamples[i - 1]);
      if (pierRun < 18) continue;
      pierRun = 0;
      const p = guideSamples[i];
      const ground = hf.heightAt(p.x, p.z);
      if (trackY - ground < 2.5) continue;
      pierBatch.add({ x: p.x, y: ground, z: p.z, w: 2.4, h: trackY - ground, d: 2.4, color: '#8d8f88' });
      pierBatch.add({ x: p.x, y: trackY - 0.7, z: p.z, w: 4.4, h: 0.7, d: 4.4, color: '#a8a99f' });
    }
    ctx.trafficPath(trackPoints, { speed: 22, offset: 0.5, count: 10, color: '#bfe8ff' });

    // Train: three carriages with glazing, doors, roof units and headlights.
    const trainCurve = new THREE.CatmullRomCurve3(trackPoints.map((p) => new THREE.Vector3(p.x, p.y + 1.8, p.z)));
    const trainMat = ctx.mat('train-body', { color: '#dfe8ec', roughness: 0.35, metalness: 0.4 });
    const trainGlass = ctx.mat('train-glass', {
      color: '#1e2e3a', roughness: 0.2, metalness: 0.35,
      emissive: '#2b5a74', emissiveIntensity: 0.7,
    });
    const headMat = ctx.glow('train-head', '#eaffff', 1, 2.0);
    const tailMat = ctx.glow('train-tail', '#ff4a3a', 0.9, 1.8);
    const cars = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 12.6), trainMat);
      body.position.y = 1.7;
      g.add(body);
      for (const side of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 9.8), trainGlass);
        win.position.set(side * 2.04, 2.35, 0);
        g.add(win);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 2.6), trainGlass);
        door.position.set(side * 2.05, 1.2, -2.2);
        g.add(door);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 4.2), trainMat);
      roof.position.y = 3.5;
      g.add(roof);
      if (i === 0) {
        const nose = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 1.2), trainMat);
        nose.position.set(0, 1.5, 6.8);
        g.add(nose);
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), headMat);
          lamp.position.set(sx * 1.1, 1.7, 7.35);
          g.add(lamp);
        }
      }
      if (i === 2) {
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), tailMat);
          lamp.position.set(sx * 1.2, 1.9, -6.35);
          g.add(lamp);
        }
      }
      ctx.world.add(g);
      cars.push(g);
    }
    const trainState = { t: 0.9 };
    ctx.trainState = trainState;
    const tmpPoint = new THREE.Vector3();
    const tmpTangent = new THREE.Vector3();
    ctx.ticker((elapsed, dt) => {
      trainState.t = (trainState.t + dt * 0.011) % 1;
      for (let i = 0; i < cars.length; i++) {
        const t = (trainState.t - i * 0.012 + 1) % 1;
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
    const station = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), stationMat);
    station.position.set(monX, trackY + 10.6, monZ + 7.8);
    ctx.world.add(station);
    ctx.label('李子坝', '轻轨穿楼 · 2 号线', monX, monBase + 55, monZ);
    // The portal is best read from the cleared plaza, straight on.
    ctx.style.views[2].pos = [monX, trackY + 9, monZ + 38];
    ctx.style.views[2].target = [monX, trackY + 1, monZ];

    // ------- Raffles City leaning towers -------
    const rfX = 16;
    const rfZ = 78;
    const rfBase = ctx.foundation(rfX, rfZ, 44, 30, { margin: 0.6, color: '#3f444a' });
    const rfGlass = ctx.mat('raffles', { color: '#6f8fa8', roughness: 0.28, metalness: 0.45 });
    const rfEdge = ctx.mat('raffles-edge', {
      color: '#8794a0', roughness: 0.4, metalness: 0.5,
      emissive: '#1d3348', emissiveIntensity: 1,
    });
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
      // Vertical edge trim: a solid, dim metal strip rather than a sub-pixel
      // glow line that bloom would smear into a glitch.
      ctx.box(rfEdge, 0.6, segs * segH, 0.6, px + 5, rfBase, pz);
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
      const top = place(t.x, t.z, t.w, t.d, t.h, '#8aa6b8', mega, 'mega', { lit: 0.55 });
      ctx.box(glowWarm, t.w + 1, 0.55, t.d + 1, t.x, top, t.z);
    }
    // Jiefangbei monument.
    const jx = 30;
    const jz = 20;
    const jy = ctx.foundation(jx, jz, 7.5, 7.5, { margin: 0.3 });
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
      [98, 92, 44], [-26, 8, 40], [158, 46, 92], [16, 78, 32], [30, 20, 26], [146, 150, 40], [-126, 80, 30],
    ];
    const isReserved = (x, z, r = 0) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + r);

    for (let x = west; x <= east; x += spacing) {
      for (let z = -220; z <= north; z += spacing) {
        if (isReserved(x, z)) continue;
        if (x < -160 && z > 120 && z < 190) continue;
        const jx2 = x + rng.range(-spacing * 0.32, spacing * 0.32);
        const jz2 = z + rng.range(-spacing * 0.32, spacing * 0.32);
        const gh = hf.heightAt(jx2, jz2);
        const slope = hf.slopeAt(jx2, jz2);
        if (gh < 1.2 || slope > 0.62) continue;
        // Elevation zoning: the riverfront keeps the dense low old town, the
        // upper ridges are sparser but allow newer high-rise clusters.
        const lowTown = gh < 13;
        const hillTop = gh > 34;
        const perCell = rng.next() < (lowTown ? 0.72 : hillTop ? 0.42 : 0.55) ? 2 : 1;
        for (let k = 0; k < perCell; k++) {
          const bx = jx2 + rng.range(-4.5, 4.5);
          const bz = jz2 + rng.range(-4.5, 4.5);
          const gh2 = hf.heightAt(bx, bz);
          const slope2 = hf.slopeAt(bx, bz);
          if (gh2 < 1.2 || slope2 > 0.66) continue;
          const dc = Math.hypot(bx - 20, bz - 6);
          const cbd = Math.exp(-(dc * dc) / (2 * 105 * 105));
          const kind = pickKind();
          const hv = 1 + (rng.next() - 0.5) * params.heightVar * 1.5;
          const zone = gh2 < 13 ? 0.62 : gh2 > 34 ? 1.16 : 1.0;
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
          h *= zone;
          // A 20-storey tower perched on a steep slope reads as a mistake.
          if (slope2 > 0.5) h = Math.min(h, 24);
          else if (slope2 > 0.38) h = Math.min(h, 48);
          if (lowTown) h = Math.min(h, 34);
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

    // Boats on the Yangtze: hulls sit in the water, with cabins and running lights.
    const boatPath = [[-260, 156], [-100, 150], [60, 158], [260, 172]].map(([x, z]) => new THREE.Vector3(x, 0.3, z));
    const boatCurve = new THREE.CatmullRomCurve3(boatPath);
    const boatMat = ctx.mat('boat', { color: '#5a6066', roughness: 0.7 });
    const boatDark = ctx.mat('boat-dark', { color: '#2f353b', roughness: 0.75 });
    const boatGlass = ctx.mat('boat-glass', { color: '#20303a', roughness: 0.25, metalness: 0.3, emissive: '#2a4a60', emissiveIntensity: 0.4 });
    const boatGlow = ctx.glow('boat-glow', '#ffd28a', 1, 2.8);
    const boats = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 3.2), boatMat);
      hull.position.y = 0.75;
      g.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 4), boatMat);
      bow.position.set(0, 0.75, 5.4);
      bow.rotation.x = Math.PI / 2;
      g.add(bow);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.9, 2.9), boatDark);
      cabin.position.set(-0.4, 2.3, 0);
      g.add(cabin);
      const windows = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.65, 2.95), boatGlass);
      windows.position.set(-0.4, 2.5, 0);
      g.add(windows);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), boatGlow);
      light.position.set(4, 1.5, 0);
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
