import * as THREE from 'three';
import { clamp } from '../rng.js';
import { gableRoofGeometry, hipRoofGeometry } from '../geom.js';
import { addStreetGrid, addLampsAlong } from './shared.js';

const PALETTE = {
  day: {
    skyTop: '#7e9aad', skyHorizon: '#e0d2b8', skyBottom: '#b9ac94', sunColor: '#fff0d2',
    fogColor: '#cbbfa8', hemiSky: '#d7d1be', hemiGround: '#5a4c3a', horizonGlow: '#ffd6a2',
    waterDeep: '#3a423c', waterShallow: '#6d7264', sunIntensity: 2.0, hemiIntensity: 0.92,
  },
  dusk: {
    skyTop: '#38445e', skyHorizon: '#ffc48a', skyBottom: '#75695e', sunColor: '#fff0d8',
    fogColor: '#b3aa9b', hemiSky: '#b8c6d4', hemiGround: '#4a443a', horizonGlow: '#ffae6a',
    waterDeep: '#3a423c', waterShallow: '#6d7264', sunIntensity: 1.0, hemiIntensity: 1.4,
  },
  night: {
    skyTop: '#050a13', skyHorizon: '#111b28', skyBottom: '#080c12', sunColor: '#93a9c4',
    fogColor: '#0d141c', hemiSky: '#2a3b52', hemiGround: '#3a2a1e', horizonGlow: '#7a3a18',
    waterDeep: '#05090c', waterShallow: '#101c21', sunIntensity: 0.32, hemiIntensity: 0.55,
  },
  nightCityGlow: 0.5,
  nightGlowColor: '#ff9a4a',
};

export default {
  id: 'xian',
  index: '03',
  name: '西安',
  en: "XI'AN",
  sub: '古都 · 长安',
  tagline: '城墙 · 钟楼 · 大雁塔',
  accent: '#e0b25c',
  accent2: '#ffe3ad',
  accentRgb: '224, 178, 92',
  fogScale: 0.45,
  exposure: 1.45,
  windowBoost: 1.6,
  waterReflect: 0.3,
  // This style builds its own pitched tile roofs on every house, so the generic
  // flat-roof parapet/plant layer would clash with them.
  roofDetail: false,
  env: PALETTE,
  patterns: [
    { value: 'grid', label: '棋盘里坊' },
  ],
  defaults: {
    density: 0.86, block: 0.92, avgHeight: 0.46, heightVar: 0.3,
    commercial: 0.2, residential: 0.62, industrial: 0.18,
    water: 0.62, parks: 0.16, terrain: 0.04, time: 0.55, fog: 0.16,
  },
  views: [
    { key: 'wall', label: '城墙全景', pos: [260, 185, 330], target: [0, 8, 20] },
    { key: 'bell', label: '钟楼', pos: [72, 78, 168], target: [0, 22, 0] },
    { key: 'pagoda', label: '大雁塔', pos: [40, 95, 285], target: [-120, 28, 175] },
  ],

  build(ctx) {
    const { rng, params } = ctx;
    const S = params.size;

    // ------- ground and moat -------
    const groundMat = ctx.nightSurface('ground', {
      color: '#8a8674', roughness: 0.97, sheen: 0.14,
      nightLift: '#2a2318', nightLiftScale: 0.4,
    });
    ctx.box(groundMat, 2000, 2, 2000, 0, -2.7, 0);
    // Ring of plain ground around the moat, extending to the horizon.
    ctx.box(groundMat, 2000, 2.6, 874, 0, -2.2, -563);
    ctx.box(groundMat, 2000, 2.6, 874, 0, -2.2, 563);
    ctx.box(groundMat, 834, 2.6, 252, -583, -2.2, 0);
    ctx.box(groundMat, 834, 2.6, 252, 583, -2.2, 0);
    ctx.box(groundMat, 320, 2.6, 240, 0, -2.2, 0);

    const stoneMat = ctx.mat('stone', { color: '#8f8878', roughness: 0.95 });
    const darkStone = ctx.mat('dark-stone', { color: '#6d675a', roughness: 0.94 });
    const wallMat = ctx.mat('wall', { color: '#8e8371', roughness: 0.96, emissive: '#241407', emissiveIntensity: 0.35 });
    const woodMat = ctx.mat('wood', { color: '#7a4a32', roughness: 0.8, emissive: '#3a1a08', emissiveIntensity: 0.55 });
    const roofGreen = ctx.mat('roof-green', { color: '#3c5a52', roughness: 0.68, metalness: 0.18, emissive: '#10251e', emissiveIntensity: 0.35 });
    const roofDark = ctx.mat('roof-dark', { color: '#45484a', roughness: 0.86, emissive: '#0d1012', emissiveIntensity: 0.3 });
    const brickMat = ctx.mat('brick', { color: '#a39170', roughness: 0.94, emissive: '#3a2a12', emissiveIntensity: 0.32 });
    const glowWarm = ctx.glow('warm', '#ffbe6a', 1, 2.4);
    const glowRed = ctx.glow('red', '#ff5f3a', 1, 2.2);
    const lanternMat = ctx.mat('lantern', { color: '#ff5a3c', roughness: 0.5, emissive: '#ff3a20', emissiveIntensity: 2.6 });
    const houseMat = ctx.facade('house', {
      winA: '#ffd9a0', winB: '#ffbb70', floorH: 3.0, colW: 2.1, lit: 0.55,
      roughness: 0.92, metalness: 0.01, glow: 1.3,
    });
    const shopMat = ctx.facade('shop', {
      winA: '#ffd18a', winB: '#ffa94e', floorH: 3.3, colW: 2.5, lit: 0.8,
      roughness: 0.8, glow: 1.6,
    });
    const roofGeo = gableRoofGeometry(1, 0.14);
    const roofBatch = ctx.instance('roofs', roofGeo, roofDark);
    const eaveGlowGeo = new THREE.BoxGeometry(1, 1, 1);
    eaveGlowGeo.translate(0, 0.5, 0);
    const eaveGlowBatch = ctx.instance('house-eaves', eaveGlowGeo, glowWarm);
    const hipGreenGeo = hipRoofGeometry(1, 0.22, 0.18);
    const hipDarkGeo = hipRoofGeometry(1, 0.2, 0.16);

    const p = (x, z) => {
      return Math.abs(x) < 148 && Math.abs(z) < 108;
    };

    // ------- city wall -------
    const wallH = 13.5;
    const wallT = 7.5;
    const halfX = 150;
    const halfZ = 110;
    const gate = 20;
    const addWall = (x, z, w, d, rot = 0) => {
      ctx.box(wallMat, w, wallH, d, x, 0.4, z, rot);
    };
    for (const z of [-halfZ, halfZ]) {
      addWall(-(gate / 2 + (halfX - gate / 2) / 2), z, halfX - gate / 2, wallT);
      addWall((gate / 2 + (halfX - gate / 2) / 2), z, halfX - gate / 2, wallT);
    }
    for (const x of [-halfX, halfX]) {
      addWall(x, -(gate / 2 + (halfZ - gate / 2) / 2), wallT, halfZ - gate / 2);
      addWall(x, (gate / 2 + (halfZ - gate / 2) / 2), wallT, halfZ - gate / 2);
    }
    // Battlement teeth along the top.
    const teethGeo = new THREE.BoxGeometry(1, 1, 1);
    teethGeo.translate(0, 0.5, 0);
    const teeth = ctx.instance('teeth', teethGeo, wallMat);
    for (let x = -halfX + 4; x <= halfX - 4; x += 6) {
      if (Math.abs(x) < gate / 2 + 2) continue;
      teeth.add({ x, y: wallH + 0.4, z: -halfZ - wallT / 2 + 0.9, w: 2.6, h: 2.1, d: 1.4, color: '#8e8371' });
      teeth.add({ x, y: wallH + 0.4, z: halfZ + wallT / 2 - 0.9, w: 2.6, h: 2.1, d: 1.4, color: '#8e8371' });
    }
    for (let z = -halfZ + 4; z <= halfZ - 4; z += 6) {
      if (Math.abs(z) < gate / 2 + 2) continue;
      teeth.add({ x: -halfX - wallT / 2 + 0.9, y: wallH + 0.4, z, w: 1.4, h: 2.1, d: 2.6, color: '#8e8371' });
      teeth.add({ x: halfX + wallT / 2 - 0.9, y: wallH + 0.4, z, w: 1.4, h: 2.1, d: 2.6, color: '#8e8371' });
    }
    // Corner towers.
    for (const cx of [-halfX, halfX]) {
      for (const cz of [-halfZ, halfZ]) {
        ctx.box(wallMat, 20, 16, 20, cx, 0.4, cz);
        const roof = new THREE.Mesh(hipGreenGeo, roofGreen);
        roof.scale.set(24, 6.4, 24);
        roof.position.set(cx, 16.4, cz);
        ctx.world.add(roof);
      }
    }

    // Gate towers: platform + two-tier pavilion.
    const gatePositions = [
      { x: 0, z: -halfZ, rot: 0 },
      { x: 0, z: halfZ, rot: 0 },
      { x: -halfX, z: 0, rot: Math.PI / 2 },
      { x: halfX, z: 0, rot: Math.PI / 2 },
    ];
    for (const gp of gatePositions) {
      ctx.box(wallMat, 30, 17, 18, gp.x, 0.4, gp.z, gp.rot);
      // arch recess
      ctx.box(darkStone, 9, 9, 1, gp.x, 0.4, gp.z + (gp.z > 0 ? 9.5 : -9.5), gp.rot);
      const py = 17.4;
      ctx.box(woodMat, 20, 8, 13, gp.x, py, gp.z, gp.rot);
      const roof1 = new THREE.Mesh(hipGreenGeo, roofGreen);
      roof1.scale.set(25, 6, 17);
      roof1.position.set(gp.x, py + 8, gp.z);
      roof1.rotation.y = gp.rot;
      ctx.world.add(roof1);
      ctx.box(woodMat, 13, 6, 9, gp.x, py + 13, gp.z, gp.rot);
      const roof2 = new THREE.Mesh(hipGreenGeo, roofGreen);
      roof2.scale.set(18, 5, 12);
      roof2.position.set(gp.x, py + 19, gp.z);
      roof2.rotation.y = gp.rot;
      ctx.world.add(roof2);
      ctx.box(glowWarm, 1.4, 1.4, 1.4, gp.x, py + 26, gp.z);
      for (let i = -1; i <= 1; i++) {
        ctx.box(lanternMat, 1.1, 1.1, 1.1, gp.x + i * 6, py + 7, gp.z + (gp.z > 0 ? 7.6 : -7.6), gp.rot);
      }
    }
    ctx.label('西安城墙', '明城墙 · 周长 13.7km', 0, 26, -halfZ);

    // ------- Bell tower and Drum tower -------
    const towerBase = (x, z, baseW, baseH) => {
      ctx.box(stoneMat, baseW, baseH, baseW, x, 0.4, z);
      ctx.box(darkStone, baseW * 0.45, baseH * 0.55, 1, x, 0.4, z + baseW / 2 + 0.5);
      // red columns
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          ctx.cylinder(woodMat, 0.5, 0.5, baseH, x + sx * baseW * 0.36, 0.4, z + sz * baseW * 0.36, 6);
        }
      }
    };
    const bellX = 0;
    const bellZ = 0;
    towerBase(bellX, bellZ, 22, 10);
    let by = 10.4;
    ctx.box(woodMat, 15, 8.5, 15, bellX, by, bellZ);
    const bellRoof1 = new THREE.Mesh(hipGreenGeo, roofGreen);
    bellRoof1.scale.set(20, 5, 20);
    bellRoof1.position.set(bellX, by + 8.5, bellZ);
    ctx.world.add(bellRoof1);
    by += 13.5;
    ctx.box(woodMat, 10.5, 6.5, 10.5, bellX, by, bellZ);
    const bellRoof2 = new THREE.Mesh(hipGreenGeo, roofGreen);
    bellRoof2.scale.set(15, 4.6, 15);
    bellRoof2.position.set(bellX, by + 6.5, bellZ);
    ctx.world.add(bellRoof2);
    by += 11.1;
    ctx.box(woodMat, 7, 4.6, 7, bellX, by, bellZ);
    const bellRoof3 = new THREE.Mesh(hipGreenGeo, roofGreen);
    bellRoof3.scale.set(10, 4, 10);
    bellRoof3.position.set(bellX, by + 4.6, bellZ);
    ctx.world.add(bellRoof3);
    ctx.box(glowWarm, 1, 1, 1, bellX, by + 8.6, bellZ);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ctx.box(lanternMat, 1.2, 1.2, 1.2, bellX + sx * 8, 12, bellZ + sz * 8);
      }
    }
    ctx.label('钟楼', '长安城中心 · 明代', bellX, 44, bellZ);
    // Warm pavilion light under each roof tier.
    for (const ty of [10.4, 19.4, 26.0, 30.6]) {
      ctx.box(glowWarm, 11.5, 0.25, 0.3, bellX, ty, bellZ + 7.6);
      ctx.box(glowWarm, 11.5, 0.25, 0.3, bellX, ty, bellZ - 7.6);
      ctx.box(glowWarm, 0.3, 0.25, 11.5, bellX + 7.6, ty, bellZ);
      ctx.box(glowWarm, 0.3, 0.25, 11.5, bellX - 7.6, ty, bellZ);
    }
    ctx.lamp(bellX, 34, bellZ, '#ffc27a', 1.3);

    towerBase(-58, 8, 18, 9);
    let dy = 9.4;
    ctx.box(woodMat, 12, 7, 12, -58, dy, 8);
    const drumRoof1 = new THREE.Mesh(hipGreenGeo, roofGreen);
    drumRoof1.scale.set(16, 4.6, 16);
    drumRoof1.position.set(-58, dy + 7, 8);
    ctx.world.add(drumRoof1);
    dy += 11.6;
    ctx.box(woodMat, 8, 4.5, 8, -58, dy, 8);
    const drumRoof2 = new THREE.Mesh(hipGreenGeo, roofGreen);
    drumRoof2.scale.set(11, 3.6, 11);
    drumRoof2.position.set(-58, dy + 4.5, 8);
    ctx.world.add(drumRoof2);
    ctx.label('鼓楼', '晨钟暮鼓', -58, 32, 8);

    // ------- Big Wild Goose Pagoda -------
    const pgX = -120;
    const pgZ = 175;
    let py = 0.4;
    for (let i = 0; i < 7; i++) {
      const w = 13 - i * 1.1;
      const h = 8.2 - i * 0.35;
      ctx.cylinder(ctx.mat('pagoda-wall', { color: '#d7c9a6', roughness: 0.94, emissive: '#6a4a20', emissiveIntensity: 0.5 }), w / 2, w / 2, h, pgX, py, pgZ, 8);
      // eaves slab
      ctx.box(darkStone, w + 3.2, 0.7, w + 3.2, pgX, py + h - 0.5, pgZ);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          ctx.lamp(pgX + sx * (w / 2 + 1.2), py + h + 0.2, pgZ + sz * (w / 2 + 1.2), '#ffb867', 0.85);
        }
      }
      py += h;
    }
    ctx.cylinder(brickMat, 0.6, 1.2, 12, pgX, py, pgZ, 8);
    ctx.label('大雁塔', '大慈恩寺 · 唐代', pgX, py + 18, pgZ);

    // ------- courtyard houses -------
    const reserved = [
      [bellX, bellZ, 26], [-58, 8, 24], [0, -halfZ, 26], [0, halfZ, 26],
      [-halfX, 0, 26], [halfX, 0, 26],
    ];
    const blocked = (x, z, r = 0) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + r);

    const house = (x, z, w, d, h, rotY = 0, shop = false) => {
      const mat = shop ? shopMat : houseMat;
      ctx.addBuilding(shop ? 'shop' : 'house', mat, {
        x, y: 0.4, z, w, h, d, rotY,
        color: shop ? rng.pick(['#b8a184', '#c4ad8c', '#a99379']) : rng.pick(['#ddd7c8', '#e5dfd2', '#d2ccbd']),
        lit: rng.range(0.35, 0.8), seed: rng.next(), variant: rng.next(),
      });
      const roof = new THREE.Mesh(roofGeo, roofDark);
      roof.scale.set(w * 1.22, 3.2, d * 1.32);
      roof.position.set(x, h + 0.4, z);
      roof.rotation.y = rotY;
      ctx.world.add(roof);
      // Warm under-eave light so the walled city is not a black roof field.
      for (const sz of [-1, 1]) {
        eaveGlowBatch.add({
          x, y: 0.4 + h - 0.12, z: z + sz * (d / 2 + 0.12),
          w: w * 0.8, h: 0.16, d: 0.28, rotY, color: '#ffcf92',
        });
      }
      if (shop) {
        ctx.box(glowWarm, w * 0.85, 0.3, 0.4, x, h + 0.2, z + d / 2 + 0.2, rotY);
      }
    };

    const spacing = 14.5 / Math.sqrt(Math.max(0.4, params.density));
    for (let x = -138; x <= 138; x += spacing) {
      for (let z = -98; z <= 98; z += spacing) {
        if (blocked(x, z, 2)) continue;
        if (Math.abs(x) < 9 && Math.abs(z) < 9) continue;
        const jx = x + rng.range(-3, 3);
        const jz = z + rng.range(-3, 3);
        if (!p(jx, jz)) continue;
        const shop = Math.abs(jx) < 26 || Math.abs(jz) < 26;
        const tall = shop && rng.chance(0.4);
        const h = tall ? rng.range(14, 21) : rng.range(6, 11);
        const w = rng.range(11, 16);
        const d = rng.range(8, 12);
        house(jx, jz, w, d, h, 0, shop);
        if (rng.chance(0.55)) {
          const wx = jx + rng.range(-1, 1) * (w / 2 + 5);
          house(wx, jz + rng.range(-4, 4), rng.range(6, 9), rng.range(5, 7), rng.range(4.5, 7), Math.PI / 2, false);
        }
      }
    }

    // Street grid + lanterns.
    addStreetGrid(ctx, {
      x0: -160, x1: 160, z0: -118, z1: 118,
      spacingX: 34, spacingZ: 32, width: 8,
    });
    addLampsAlong(ctx, [{ x: -150, y: 0.6, z: 0 }, { x: 150, y: 0.6, z: 0 }], 16, '#ff9d5a', 8);
    addLampsAlong(ctx, [{ x: 0, y: 0.6, z: -110 }, { x: 0, y: 0.6, z: 110 }], 16, '#ff9d5a', 8);
    // Lantern strings over the central avenues.
    for (let z = -100; z <= 100; z += 16) {
      ctx.box(glowRed, 0.5, 0.5, 0.5, 0, 5.5, z);
      ctx.box(glowWarm, 0.4, 0.4, 0.4, -30, 5.2, z);
      ctx.box(glowWarm, 0.4, 0.4, 0.4, 30, 5.2, z);
    }
    for (let x = -130; x <= 130; x += 16) {
      ctx.box(glowRed, 0.5, 0.5, 0.5, x, 5.5, 0);
    }

    // Fields and tree rows outside the moat.
    const fieldMats = [
      ctx.mat('field-a', { color: '#5d6e45', roughness: 1.0 }),
      ctx.mat('field-b', { color: '#6d7a4c', roughness: 1.0 }),
      ctx.mat('field-c', { color: '#8a7a56', roughness: 1.0 }),
    ];
    for (let i = 0; i < 90; i++) {
      const x = rng.chance(0.5) ? rng.range(-680, -190) : rng.range(190, 680);
      const z = rng.range(-560, 560);
      if (Math.abs(z) < 180 && Math.abs(x) < 230) continue;
      // Fields are zero-thickness decals lying on the ground: no side faces to
      // read as floating cards, and no vertical offset from the terrain.
      const plane = ctx.plane(rng.pick(fieldMats), rng.range(28, 80), rng.range(18, 46), x, 0.43, z);
      plane.renderOrder = 1;
      if (rng.chance(0.5)) {
        ctx.tree(x + rng.range(-20, 20), 0.4, z + rng.range(-15, 15), rng.range(0.9, 1.5), 'pine', '#425c39');
      }
    }
    // Warm up-lights along the inner face of the city wall.
    ctx.box(glowWarm, 280, 0.22, 0.3, 0, 3.6, -106.6);
    ctx.box(glowWarm, 280, 0.22, 0.3, 0, 3.6, 106.6);
    ctx.box(glowWarm, 0.3, 0.22, 208, -146.6, 3.6, 0);
    ctx.box(glowWarm, 0.3, 0.22, 208, 146.6, 3.6, 0);

    // Trees, mostly pines around courtyards and moat.
    for (let i = 0; i < 280; i++) {
      const x = rng.range(-200, 200);
      const z = rng.range(-160, 160);
      if (!p(x, z) && !(Math.abs(x) > 160 && Math.abs(x) < 210 && Math.abs(z) < 140)) continue;
      ctx.tree(x, 0.35, z, rng.range(0.9, 1.5), rng.chance(0.65) ? 'pine' : 'round', rng.chance(0.5) ? '#4c6b41' : '#5c7a48');
    }

    // Moatside lanterns.
    for (let x = -170; x <= 170; x += 24) {
      ctx.lamp(x, 3.4, -124, '#ffb36a', 0.9);
      ctx.lamp(x, 3.4, 124, '#ffb36a', 0.9);
    }
    // Lanterns on top of the city wall.
    for (let x = -142; x <= 142; x += 20) {
      ctx.lamp(x, wallH + 2.4, -108, '#ff9f58', 1.0);
      ctx.lamp(x, wallH + 2.4, 108, '#ff9f58', 1.0);
    }
    for (let z = -102; z <= 102; z += 20) {
      ctx.lamp(-148, wallH + 2.4, z, '#ff9f58', 1.0);
      ctx.lamp(148, wallH + 2.4, z, '#ff9f58', 1.0);
    }

    // Distant Qinling-style rounded mountain silhouettes to the north.
    const mountainMat = ctx.mat('mountain', { color: '#948a78', roughness: 1.0 });
    for (let i = 0; i < 13; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mountainMat);
      const height = rng.range(48, 76);
      hill.scale.set(rng.range(150, 230), height, rng.range(100, 150));
      hill.position.set(-820 + i * 135 + rng.range(-30, 30), -height * 0.6, -880 - rng.range(0, 180));
      ctx.world.add(hill);
    }
    // A second, hazier ridge behind.
    const farMountainMat = ctx.mat('mountain-far', { color: '#a79c87', roughness: 1.0 });
    for (let i = 0; i < 9; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), farMountainMat);
      const height = rng.range(60, 95);
      hill.scale.set(rng.range(200, 300), height, rng.range(140, 200));
      hill.position.set(-900 + i * 220, -height * 0.64, -1080 - rng.range(0, 140));
      ctx.world.add(hill);
    }
    // Poplar / pine belt at the foot of the mountains.
    for (let i = 0; i < 90; i++) {
      const x = rng.range(-500, 500);
      const z = rng.range(-460, -300);
      ctx.tree(x, 0.2, z, rng.range(1.2, 2.2), 'pine', '#394f35');
    }
  },
};
