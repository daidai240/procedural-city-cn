import * as THREE from 'three';
import { gableRoofGeometry, hipRoofGeometry, archBridgeGeometry } from '../geom.js';

const PALETTE = {
  day: {
    skyTop: '#9fb6c2', skyHorizon: '#dfe8e2', skyBottom: '#c0cdc7', sunColor: '#fff5e2',
    fogColor: '#b3c0ba', hemiSky: '#cfdbd6', hemiGround: '#454b3f', horizonGlow: '#e8f0e8',
    waterDeep: '#2e403c', waterShallow: '#5b7c72', sunIntensity: 1.7, hemiIntensity: 1.0,
  },
  dusk: {
    skyTop: '#6a7c8c', skyHorizon: '#f0c2a0', skyBottom: '#a5a8a0', sunColor: '#ffe0b0',
    fogColor: '#c9b8a6', hemiSky: '#e0d2c0', hemiGround: '#45443c', horizonGlow: '#ffd6a8',
    waterDeep: '#38413f', waterShallow: '#6d7a70', sunIntensity: 1.35, hemiIntensity: 0.8,
  },
  night: {
    skyTop: '#071016', skyHorizon: '#1a2830', skyBottom: '#0b1419', sunColor: '#9db8cc',
    fogColor: '#0e181e', hemiSky: '#2a3e48', hemiGround: '#2e2a24', horizonGlow: '#6a3016',
    waterDeep: '#050b0e', waterShallow: '#0f2026', sunIntensity: 0.3, hemiIntensity: 0.58,
  },
  nightCityGlow: 0.35,
  nightGlowColor: '#ffb070',
};

export default {
  id: 'jiangnan',
  index: '05',
  name: '江南',
  en: 'JIANGNAN',
  sub: '水乡 · 烟雨',
  tagline: '白墙黛瓦 · 小桥流水',
  accent: '#7fc8b2',
  accent2: '#d7fff1',
  accentRgb: '127, 200, 178',
  fogScale: 0.95,
  exposure: 1.1,
  waterReflect: 0.6,
  env: PALETTE,
  hasWater: true,
  // Pitched tile roofs are part of every house; skip the flat-roof detail layer.
  roofDetail: false,
  patterns: [
    { value: 'grid', label: '水巷棋盘' },
  ],
  defaults: {
    density: 0.8, block: 0.8, avgHeight: 0.32, heightVar: 0.18,
    commercial: 0.08, residential: 0.8, industrial: 0.12,
    water: 0.9, parks: 0.2, terrain: 0.02, time: 0.3, fog: 0.2,
  },
  views: [
    // Boat-level camera: low over the canal, slightly off the centre line, so
    // the first frame reads as a water lane instead of a tunnel between walls.
    { key: 'lane', label: '水巷视角', pos: [4.2, 3.1, 240], target: [-2.5, 2.4, 80] },
    { key: 'bridge', label: '石拱桥', pos: [28, 22, 8], target: [0, 4, -40] },
    { key: 'aerial', label: '水乡全景', pos: [200, 160, 300], target: [0, 2, 0] },
  ],

  build(ctx) {
    const { rng, params } = ctx;

    // ------- ground blocks around canals -------
    const groundMat = ctx.nightSurface('ground', {
      color: '#5f665a', roughness: 0.97, sheen: 0.18,
      nightLift: '#202620', nightLiftScale: 0.35,
    });
    ctx.box(groundMat, 2000, 2, 2000, 0, -2.6, 0);
    const stoneMat = ctx.mat('stone', { color: '#9a9a8c', roughness: 0.94 });
    const darkStone = ctx.mat('dark-stone', { color: '#55574f', roughness: 0.92 });
    const wallMat = ctx.facade('whitewall', {
      winA: '#ffd9a0', winB: '#ffbd78', floorH: 3.4, colW: 2.6, lit: 0.5,
      roughness: 0.95, metalness: 0.0, glow: 1.6,
    });
    const woodMat = ctx.mat('wood', { color: '#463226', roughness: 0.85 });
    const roofMat = ctx.mat('roof', { color: '#343b42', roughness: 0.72, metalness: 0.08 });
    const bridgeMat = ctx.mat('bridge', { color: '#8b8c80', roughness: 0.95 });
    const barkMat = ctx.mat('bark', { color: '#4a3c2e', roughness: 0.95 });
    const redGlow = ctx.glow('lantern', '#ff7146', 0.95, 2.2);
    const warmGlow = ctx.glow('warm', '#ffcf95', 0.9, 2.0);
    const roofGeo = gableRoofGeometry(1, 0.18);
    // All small house parts share instanced batches, otherwise every window,
    // eave, ridge and step becomes its own draw call (this style had 2.6k).
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    unitBox.translate(0, 0.5, 0);
    const roofBatch = ctx.instance('jiangnan-roofs', roofGeo, roofMat);
    const eaveBatch = ctx.instance('jiangnan-eaves', unitBox, stoneMat);
    const ridgeBatch = ctx.instance('jiangnan-ridges', unitBox, darkStone);
    const trimBatch = ctx.instance('jiangnan-trim', unitBox, woodMat);
    const lanternBatch = ctx.instance('jiangnan-lanterns', unitBox, redGlow);
    const stepBatch = ctx.instance('jiangnan-steps', unitBox, stoneMat);

    const yTop = 0.55;
    const slab = (x, z, w, d) => {
      ctx.box(groundMat, w, 2.2, d, x, yTop - 2.2, z);
      // embankment caps
      return null;
    };
    // Main canal: x in [-8, 8]. Cross canals at z=-80 and z=96, width 12.
    const xBands = [[-330, -8], [8, 330]];
    const zBands = [[-330, -86], [-74, 90], [102, 330]];
    for (const [xa, xb] of xBands) {
      for (const [za, zb] of zBands) {
        slab((xa + xb) / 2, (za + zb) / 2, xb - xa, zb - za);
      }
    }
    // Canal walls.
    const wall = (x, z, w, d) => ctx.box(stoneMat, w, 1.5, d, x, 0.2, z);
    for (const [xa, xb] of xBands) {
      const xEdge = xa < 0 ? -8 : 8;
      wall(xEdge + (xa < 0 ? -0.6 : 0.6), -213, 1.2, 240);
      wall(xEdge + (xa < 0 ? -0.6 : 0.6), 8, 1.2, 160);
      wall(xEdge + (xa < 0 ? -0.6 : 0.6), 216, 1.2, 228);
    }
    for (const zEdge of [-86, -74, 90, 102]) {
      wall(-169, zEdge, 322, 1.2);
      wall(169, zEdge, 322, 1.2);
    }

    // ------- houses -------
    const house = (x, z, w, d, h, rotY = 0, opts = {}) => {
      ctx.addBuilding('houses', wallMat, {
        x, y: yTop, z, w, h, d, rotY,
        color: rng.pick(['#f2eee2', '#f7f3e8', '#e8e3d5', '#efe9dc']),
        lit: rng.range(0.35, 0.7), seed: rng.next(), variant: rng.next(),
      });
      roofBatch.add({ x, y: yTop + h, z, w: w * 1.2, h: 4.1, d: d * 1.36, rotY, color: '#ffffff' });
      // Pale eave board under the dark tile roof.
      eaveBatch.add({ x, y: yTop + h + 0.05, z, w: w * 1.18, h: 0.2, d: d * 1.34, rotY, color: '#ffffff' });
      // Dark ridge along the roof top.
      ridgeBatch.add({ x, y: yTop + h + 3.85, z, w: w * 1.16, h: 0.28, d: 0.5, rotY, color: '#ffffff' });
      // Wooden window / door bands on the canal-facing side.
      const facing = opts.facing ?? 1;
      const dx = Math.sin(rotY) * (d / 2 + 0.16) * facing;
      const dz = Math.cos(rotY) * (d / 2 + 0.16) * facing;
      const tx = Math.cos(rotY);
      const tz = -Math.sin(rotY);
      const floors = Math.max(1, Math.floor(h / 3.4));
      for (let f = 0; f < floors; f++) {
        trimBatch.add({ x: x + dx, y: yTop + 1.6 + f * 3.4, z: z + dz, w: w * 0.66, h: 0.5, d: 0.3, rotY, color: '#ffffff' });
        // Lattice windows instead of a blank white wall.
        for (const off of [-0.24, 0.24]) {
          trimBatch.add({
            x: x + dx + tx * w * off, y: yTop + 2.3 + f * 3.4, z: z + dz + tz * w * off,
            w: w * 0.17, h: 1.3, d: 0.18, rotY, color: '#ffffff',
          });
          lanternBatch.add({
            x: x + dx + tx * w * (off + 0.13), y: yTop + 2.0 + f * 3.4, z: z + dz + tz * w * (off + 0.13),
            w: 0.3, h: 0.3, d: 0.3, rotY, color: '#ffffff',
          });
        }
        if (rng.chance(0.8)) {
          lanternBatch.add({
            x: x + dx * 1.05 + Math.cos(rotY) * w * 0.36, y: yTop + 2.2 + f * 3.4,
            z: z + dz * 1.05 - Math.sin(rotY) * w * 0.36, w: 0.5, h: 0.5, d: 0.5, rotY,
            color: '#ffffff',
          });
        }
      }
      if (rng.chance(0.5)) {
        trimBatch.add({ x: x + dx, y: yTop + 1.2, z: z + dz, w: 1.4, h: 2.4, d: 0.3, rotY, color: '#ffffff' });
      }
      // White side wall with dark trim.
      ridgeBatch.add({ x, y: yTop + h - 0.2, z, w: w + 0.15, h: 0.35, d: d + 0.15, rotY, color: '#ffffff' });
    };

    const houseW = 11.5;
    const gaps = [[-92, -68], [84, 108]];
    const inGap = (z) => gaps.some(([a, b]) => z > a && z < b);
    for (const side of [-1, 1]) {
      for (let z = -240; z <= 240; z += 15.5) {
        if (inGap(z)) continue;
        if (Math.abs(z + 40) < 5 || Math.abs(z - 56) < 5 || Math.abs(z - 170) < 5) continue;
        house(side * 14.5, z, rng.range(9.5, 12.5), rng.range(9, 11.5), rng.range(7, 11.5), side < 0 ? Math.PI / 2 : -Math.PI / 2, { facing: -side });
      }
      // A second row behind the canal houses gives the water town depth.
      for (let z = -233; z <= 240; z += 25) {
        if (inGap(z)) continue;
        house(side * 28, z, rng.range(8.5, 11), rng.range(8, 10), rng.range(6, 9), side < 0 ? Math.PI / 2 : -Math.PI / 2, { facing: -side });
      }
    }
    for (const zEdge of [-80, 96]) {
      for (const side of [-1, 1]) {
        for (let x = -280; x <= 280; x += 15.5) {
          if (Math.abs(x) < 20) continue;
          if (Math.abs(x + 70) < 5 || Math.abs(x - 60) < 5 || Math.abs(x - 160) < 5) continue;
          house(x, zEdge + side * 14, rng.range(9.5, 12.5), rng.range(9, 11.5), rng.range(7, 10.5), side < 0 ? 0 : Math.PI, { facing: -side });
        }
      }
    }

    // ------- arched stone bridges -------
    // A faint arch-shaped reflection on the canal surface: the water shader
    // only mirrors the sky, so the bridge itself needs a decal to read.
    const reflCanvas = document.createElement('canvas');
    reflCanvas.width = 128;
    reflCanvas.height = 128;
    const rctx = reflCanvas.getContext('2d');
    rctx.fillStyle = 'rgba(10,22,20,0.62)';
    rctx.fillRect(0, 0, 128, 128);
    rctx.fillStyle = 'rgba(150,182,172,0.5)';
    rctx.beginPath();
    rctx.arc(64, 128, 46, Math.PI, 0);
    rctx.fill();
    for (let yy = 6; yy < 128; yy += 10) {
      rctx.fillStyle = 'rgba(255,255,255,0.05)';
      rctx.fillRect(0, yy, 128, 2);
    }
    const reflTex = ctx.addTexture(new THREE.CanvasTexture(reflCanvas));
    reflTex.colorSpace = THREE.SRGBColorSpace;
    const reflMat = new THREE.MeshBasicMaterial({
      map: reflTex, transparent: true, opacity: 0.62, depthWrite: false,
    });
    reflMat.userData.disposeOnClear = true;
    ctx.materials.push(reflMat);

    const bridge = (x, z, span, depth, rotY, label) => {
      const geo = archBridgeGeometry(span, 6.4, depth, 0.6);
      const mesh = new THREE.Mesh(geo, bridgeMat);
      mesh.position.set(x, yTop, z);
      mesh.rotation.y = rotY;
      ctx.world.add(mesh);
      const refl = ctx.plane(reflMat, span * 1.15, depth * 1.8, x, 0.07, z, -Math.PI / 2);
      refl.rotation.y = rotY;
      refl.renderOrder = 2;
      // railings
      for (const s of [-1, 1]) {
        const ox = Math.cos(rotY) * s * (depth / 2 - 0.5);
        const oz = -Math.sin(rotY) * s * (depth / 2 - 0.5);
        ctx.box(darkStone, span, 1.1, 0.55, x + ox, yTop + 6.2, z + oz, rotY);
        for (let i = -1; i <= 1; i++) {
          ctx.box(darkStone, 0.7, 1.6, 0.7, x + ox + Math.cos(rotY) * i * span * 0.4, yTop + 5.4, z + oz - Math.sin(rotY) * i * span * 0.4, rotY);
        }
      }
      for (let i = -2; i <= 2; i++) {
        ctx.lamp(x + Math.cos(rotY) * i * 3.4, yTop + 7.4, z - Math.sin(rotY) * i * 3.4, '#ffc98a', 0.8);
      }
      if (label) ctx.label(label, '青石拱桥', x, yTop + 12, z);
    };
    bridge(0, -40, 24, 7.5, 0, '石拱桥');
    bridge(0, 56, 22, 7, 0);
    bridge(0, 170, 24, 7, 0);
    bridge(-74, -80, 20, 7, Math.PI / 2);
    bridge(64, -80, 20, 7, Math.PI / 2);
    bridge(-74, 96, 20, 7, Math.PI / 2);

    // ------- boats -------
    const boatMat = ctx.mat('boat-wood', { color: '#3b2d23', roughness: 0.8 });
    const canopyMat = ctx.mat('canopy', { color: '#15171a', roughness: 0.9 });
    const makeBoat = (curve, tint) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.35, 2.9), boatMat);
      hull.position.y = 0.6;
      g.add(hull);
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4.1, 10, 1, false, 0, Math.PI), canopyMat);
      canopy.rotation.z = Math.PI / 2;
      canopy.rotation.x = Math.PI / 2;
      canopy.position.y = 2.1;
      g.add(canopy);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 2.6), boatMat);
      stem.position.set(5.0, 1.3, 0);
      g.add(stem);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), redGlow);
      lantern.position.set(-4.0, 1.9, 0);
      g.add(lantern);
      ctx.world.add(g);
      return { g, off: rng.next(), curve, speed: 0.004 + rng.next() * 0.002, tint };
    };
    const vertCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.8, -260), new THREE.Vector3(0, 0.8, -60),
      new THREE.Vector3(0, 0.8, 60), new THREE.Vector3(0, 0.8, 260),
    ]);
    const horizCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-280, 0.8, -80), new THREE.Vector3(-80, 0.8, -80),
      new THREE.Vector3(80, 0.8, -80), new THREE.Vector3(280, 0.8, -80),
    ]);
    const boats = [
      makeBoat(vertCurve), makeBoat(horizCurve), makeBoat(horizCurve),
    ];
    boats[0].off = 0.12;
    ctx.ticker((elapsed) => {
      for (const b of boats) {
        const t = (elapsed * b.speed + b.off) % 1;
        const p = b.curve.getPointAt(t);
        const tan = b.curve.getTangentAt(t);
        b.g.position.copy(p);
        b.g.rotation.y = Math.atan2(tan.x, tan.z) + (b.curve === horizCurve ? Math.PI / 2 : 0);
      }
    });
    ctx.label('水巷', '小桥流水人家', 0, 12, 78);
    ctx.label('乌篷船', '摇橹而过', 0, 5, 128);
    ctx.label('白墙黛瓦', '枕河人家', -20, 14, -8);

    // Stone footpaths along both canal banks.
    for (const side of [-1, 1]) {
      ctx.box(stoneMat, 2.6, 0.22, 430, side * 10.2, yTop, 25);
    }
    for (let z = -240; z <= 240; z += 22) {
      if (inGap(z)) continue;
      ctx.lamp(-10.2, 3.2, z, '#ff8a5a', 0.85);
      ctx.lamp(10.2, 3.2, z + 11, '#ff8a5a', 0.85);
    }
    for (const z of [-210, -170, -130, -90, -50, -10, 30, 60, 90, 130, 170, 210, 250]) {
      for (const side of [-1, 1]) {
        for (let s = 0; s < 5; s++) {
          stepBatch.add({
            x: side * (9.2 + s * 1.1), y: yTop - 0.2 - s * 0.18, z,
            w: 1.5, h: 0.28, d: 1.4, color: '#ffffff',
          });
        }
      }
    }

    // ------- willows and courtyard trees -------
    for (let i = 0; i < 170; i++) {
      const side = rng.chance(0.5) ? -1 : 1;
      const x = side * rng.range(10.5, 13.5);
      const z = rng.range(-280, 280);
      if (inGap(z)) continue;
      ctx.tree(x, yTop, z, rng.range(0.7, 1.05), 'willow', rng.pick(['#7e9661', '#718d58', '#8aa06c']));
    }
    for (let i = 0; i < 110; i++) {
      const x = rng.range(-280, 280);
      const z = rng.range(-280, 280);
      if (Math.abs(x) < 20 || Math.abs(z + 80) < 18 || Math.abs(z - 96) < 18) continue;
      ctx.tree(x, yTop, z, rng.range(0.9, 1.4), 'round', rng.pick(['#5f7d4d', '#6d8a55']));
    }
    // Distant low hills in the mist.
    const hillMat = ctx.mat('hills', { color: '#7d8b78', roughness: 1.0 });
    for (let i = 0; i < 5; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), hillMat);
      hill.scale.set(rng.range(160, 260), rng.range(28, 46), rng.range(90, 140));
      hill.position.set(-400 + i * 210, -18, -420 - rng.range(0, 80));
      ctx.world.add(hill);
    }

    // ------- distant pagoda -------
    const pgX = -120;
    const pgZ = 208;
    let py = yTop;
    for (let i = 0; i < 7; i++) {
      const r = 5.2 - i * 0.42;
      const h = 6.4 - i * 0.25;
      ctx.cylinder(ctx.mat('pagoda-wall', { color: '#ddd6c6', roughness: 0.94 }), r, r, h, pgX, py, pgZ, 8);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, 1.9, 8), roofMat);
      roof.position.set(pgX, py + h + 0.4, pgZ);
      ctx.world.add(roof);
      py += h + 0.9;
    }
    ctx.cylinder(roofMat, 0.25, 0.55, 9, pgX, py, pgZ, 6);
    ctx.label('水乡古塔', '七层砖塔', pgX, py + 12, pgZ);

    // Bank lanterns already light the canal; do not scatter extra point sprites
    // on the water (they read as floating squares).

    // Mist layer near the water.
    const mistMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#cfdbd8'), transparent: true, opacity: 0.012,
      depthWrite: false, side: THREE.DoubleSide,
    });
    mistMat.userData.disposeOnClear = true;
    ctx.materials.push(mistMat);
    for (let i = 0; i < 5; i++) {
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(700, 200), mistMat);
      mist.rotation.x = -Math.PI / 2;
      mist.position.set(0, 2 + i * 6, rng.range(-100, 160));
      ctx.world.add(mist);
    }
  },
};
