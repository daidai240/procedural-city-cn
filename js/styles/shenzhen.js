import * as THREE from 'three';
import { clamp } from '../rng.js';
import { createLedScreenMaterial } from '../materials.js';
import { tubeTowerGeometry, makeTextTexture } from '../geom.js';
import { addRoad } from './shared.js';

const PALETTE = {
  day: {
    skyTop: '#6d8fb2', skyHorizon: '#c6d4dd', skyBottom: '#98a8b4', sunColor: '#fff2d8',
    fogColor: '#b4c5d2', hemiSky: '#b9d2e8', hemiGround: '#3c3a3c', horizonGlow: '#ffd8b0',
    waterDeep: '#263a46', waterShallow: '#4d6f7c', sunIntensity: 1.8, hemiIntensity: 0.8,
  },
  dusk: {
    skyTop: '#2f2a62', skyHorizon: '#ff6f9a', skyBottom: '#4a3f66', sunColor: '#ffb080',
    fogColor: '#8a5f82', hemiSky: '#d98fc0', hemiGround: '#332b38', horizonGlow: '#d92f8a',
    waterDeep: '#231f3a', waterShallow: '#4e3f63', sunIntensity: 1.15, hemiIntensity: 0.6,
  },
  night: {
    skyTop: '#05030f', skyHorizon: '#160a26', skyBottom: '#080512', sunColor: '#a8b8e8',
    fogColor: '#0b0816', hemiSky: '#332a5e', hemiGround: '#2e1a33', horizonGlow: '#7a1a5a',
    waterDeep: '#080b1c', waterShallow: '#22264a', sunIntensity: 0.35, hemiIntensity: 0.64,
  },
  nightCityGlow: 0.9,
  nightGlowColor: '#ff2bd6',
};

export default {
  id: 'shenzhen',
  index: '04',
  name: '深圳',
  en: 'SHENZHEN',
  sub: '赛博 · 未来城',
  tagline: '霓虹矩阵 · 超级天际线',
  accent: '#ff4fd8',
  accent2: '#ffd1f5',
  accentRgb: '255, 79, 216',
  fogScale: 0.85,
  exposure: 1.02,
  waterReflect: 0.26,
  env: PALETTE,
  hasWater: true,
  patterns: [
    { value: 'grid', label: '高密棋盘' },
    { value: 'radial', label: '环状矩阵' },
    { value: 'organic', label: '自由路网' },
  ],
  defaults: {
    density: 0.98, block: 0.72, avgHeight: 1.24, heightVar: 0.85,
    commercial: 0.5, residential: 0.4, industrial: 0.1,
    water: 0.45, parks: 0.06, terrain: 0.04, time: 0.94, fog: 0.4,
  },
  views: [
    { key: 'bay', label: '深圳湾', pos: [300, 290, 650], target: [0, 82, -30] },
    { key: 'canyon', label: '霓虹街谷', pos: [34, 24, 170], target: [0, 48, -40] },
    { key: 'aerial', label: '矩阵航拍', pos: [500, 430, 680], target: [0, 40, -30] },
  ],

  build(ctx) {
    const { rng, params } = ctx;
    const S = params.size;

    // ------- land / bay -------
    const groundMat = ctx.mat('ground', { color: '#1b1e24', roughness: 0.82, metalness: 0.15 });
    ctx.box(groundMat, 2000, 2, 2000, 0, -2.6, 0);
    ctx.box(groundMat, 680, 3, 360, 0, -2.4, -94);
    const bankMat = ctx.mat('bank', { color: '#3c3f46', roughness: 0.85 });
    ctx.box(bankMat, 680, 4.4, 3, 0, 0.4, 84);
    // Wet reflective ground strip along the bay.
    const wetMat = ctx.mat('wet', { color: '#20242c', roughness: 0.28, metalness: 0.35 });
    ctx.box(wetMat, 680, 0.3, 26, 0, 0.35, 70);

    // ------- materials -------
    const glass = ctx.facade('glass', {
      winA: '#d8f4ff', winB: '#ffd6f8', floorH: 4.2, colW: 2.7, lit: 0.55,
      roughness: 0.18, metalness: 0.6, rim: 0.18, rimColor: '#8fd7ff', glow: 1.3,
    });
    const blue = ctx.facade('blue', {
      winA: '#a8e8ff', winB: '#7fb4ff', floorH: 3.9, colW: 2.4, lit: 0.48,
      roughness: 0.14, metalness: 0.68, rim: 0.22, rimColor: '#6fb7ff', glow: 1.3,
    });
    const dark = ctx.facade('dark', {
      winA: '#ffb0ef', winB: '#a8d8ff', floorH: 3.5, colW: 2.2, lit: 0.4,
      roughness: 0.45, metalness: 0.4, rim: 0.1, rimColor: '#ff7fe0', glow: 1.6,
    });
    const towerGlass = ctx.mat('tower-glass', { color: '#7d9fb8', roughness: 0.14, metalness: 0.65 });
    const towerGlass2 = ctx.mat('tower-glass2', { color: '#a2b8c8', roughness: 0.12, metalness: 0.7 });
    const darkMetal = ctx.mat('dark-metal', { color: '#5d6570', roughness: 0.4, metalness: 0.8 });
    const deckMat = ctx.mat('deck', { color: '#2a2e36', roughness: 0.7 });
    const neonCyan = ctx.glow('neon-cyan', '#00e5ff', 1, 2.8);
    const neonMagenta = ctx.glow('neon-magenta', '#ff2bd6', 1, 2.8);
    const neonWarm = ctx.glow('neon-warm', '#ffb347', 1, 2.4);
    const beacon = ctx.glow('beacon', '#ff3344', 0.9, 2.8);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    const cyanBatch = ctx.instance('neon-cyan-box', unit.clone(), neonCyan);
    const magentaBatch = ctx.instance('neon-magenta-box', unit.clone(), neonMagenta);
    const warmBatch = ctx.instance('neon-warm-box', unit.clone(), neonWarm);

    // ------- supertalls -------
    // Ping An Finance Centre
    const paX = -4;
    const paZ = -44;
    const paGeo = tubeTowerGeometry({ height: 236, rBottom: 18, rTop: 12, waist: 0.1, rings: 26, sides: 20 });
    const pa = new THREE.Mesh(paGeo, towerGlass2);
    pa.position.set(paX, 0.4, paZ);
    ctx.world.add(pa);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      cyanBatch.add({
        x: paX + Math.cos(a) * 16, y: 0.4, z: paZ + Math.sin(a) * 16,
        w: 0.6, h: 232, d: 0.6, color: '#00e5ff',
      });
    }
    ctx.cylinder(darkMetal, 0.5, 1.2, 26, paX, 236.4, paZ, 8);
    ctx.sphere(beacon, 0.8, paX, 264, paZ, 8);
    ctx.label('平安金融中心', '599m · 深圳之巅', paX, 274, paZ);

    // China Resources "Spring Bamboo"
    const cbX = 86;
    const cbZ = -104;
    const cbGeo = tubeTowerGeometry({ height: 178, rBottom: 17, rTop: 2.2, waist: 0.35, rings: 22, sides: 28 });
    const cb = new THREE.Mesh(cbGeo, towerGlass);
    cb.position.set(cbX, 0.4, cbZ);
    ctx.world.add(cb);
    for (let i = 1; i <= 7; i++) {
      const y = i * 24;
      const t = y / 178;
      const r = 17 + (2.2 - 17) * t;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.4, 6, 40), neonCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cbX, y, cbZ);
      ctx.world.add(ring);
    }
    ctx.label('春笋', '中国华润大厦', cbX, 192, cbZ);

    // KK100-like curved tower
    const kkX = -96;
    const kkZ = -18;
    const kkGeo = tubeTowerGeometry({ height: 168, rBottom: 15, rTop: 8, waist: 0.5, rings: 22, sides: 20 });
    const kk = new THREE.Mesh(kkGeo, towerGlass);
    kk.position.set(kkX, 0.4, kkZ);
    ctx.world.add(kk);
    ctx.box(neonMagenta, 1.2, 160, 1.2, kkX + 12, 0.4, kkZ + 10);
    ctx.label('京基100', '441m', kkX, 182, kkZ);

    // ------- street grid -------
    const centers = { x: 10, z: -20 };
    if (params.pattern === 'radial') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const pts = [];
        for (let r = 14; r <= 260; r += 60) {
          pts.push({ x: centers.x + Math.cos(a) * r, y: 0.62, z: centers.z + Math.sin(a) * r });
        }
        addRoad(ctx, pts, { width: 8, lamps: true, lampSpacing: 26, divisions: 50 });
      }
      for (let r = 46; r <= 220; r += 42) {
        const pts = [];
        for (let i = 0; i <= 56; i++) {
          const a = (i / 56) * Math.PI * 2;
          pts.push({ x: centers.x + Math.cos(a) * r, y: 0.62, z: centers.z + Math.sin(a) * r });
        }
        addRoad(ctx, pts, { width: 7, divisions: 64 });
      }
    } else {
      const x0 = -270;
      const x1 = 270;
      const z0 = -260;
      const z1 = 78;
      const spacingX = 30 / Math.sqrt(params.density);
      const spacingZ = 28 / Math.sqrt(params.density);
      for (let x = x0; x <= x1; x += spacingX) {
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const z = z0 + ((z1 - z0) * k) / 8;
          const off = params.pattern === 'organic' ? Math.sin((k + x) * 0.03) * 10 : 0;
          pts.push({ x: x + off, y: 0.62, z });
        }
        addRoad(ctx, pts, { width: 7.5, lamps: true, lampSpacing: 28, divisions: 40 });
      }
      for (let z = z0; z <= z1; z += spacingZ) {
        addRoad(ctx, [
          { x: x0, y: 0.62, z },
          { x: 0, y: 0.62, z },
          { x: x1, y: 0.62, z },
        ], { width: 7, lamps: true, lampSpacing: 30, divisions: 28 });
      }
    }

    // ------- dense neon towers -------
    const reserved = [[paX, paZ, 30], [cbX, cbZ, 30], [kkX, kkZ, 26]];
    const blocked = (x, z, r = 0) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + r);
    const towers = [];
    const spacing = 22 / Math.sqrt(params.density);
    for (let x = -262; x <= 262; x += spacing) {
      for (let z = -252; z <= 76; z += spacing) {
        const jx = x + rng.range(-spacing * 0.25, spacing * 0.25);
        const jz = z + rng.range(-spacing * 0.25, spacing * 0.25);
        if (blocked(jx, jz, 2)) continue;
        const dist = Math.hypot(jx - centers.x, jz - centers.z);
        const bias = clamp(1.3 - dist / 380, 0.3, 1);
        const count = rng.next() < 0.35 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const bx = jx + rng.range(-5, 5);
          const bz = jz + rng.range(-5, 5);
          const hv = 1 + (rng.next() - 0.5) * params.heightVar * 1.7;
          let h = clamp(rng.range(38, 120) * bias * hv * params.avgHeight, 18, 195);          const w = rng.range(10, 17);
          const d = rng.range(10, 17);
          const kind = rng.next();
          const mat = kind < 0.45 ? glass : kind < 0.8 ? blue : dark;
          const key = kind < 0.45 ? 'glass' : kind < 0.8 ? 'blue' : 'dark';
          const color = kind < 0.45 ? rng.pick(['#7f9fb8', '#8fa8bd', '#6f8ba2']) :
            kind < 0.8 ? rng.pick(['#7593ad', '#86a2b8', '#68839a']) : rng.pick(['#5f5f6e', '#6b6272', '#575b68']);
          ctx.addBuilding(key, mat, {
            x: bx, y: 0.4, z: bz, w, h, d,
            color, lit: rng.range(0.5, 0.95), seed: rng.next(), variant: rng.next(),
          });
          towers.push({ x: bx, z: bz, h, w, d });
          // Setback crown for the tallest towers.
          if (h > 105) {
            const tw = w * rng.range(0.5, 0.72);
            const td = d * rng.range(0.5, 0.72);
            const th = h * rng.range(0.08, 0.16);
            ctx.addBuilding(key, mat, {
              x: bx, y: 0.4 + h, z: bz, w: tw, h: th, d: td,
              color, lit: 0.8, seed: rng.next(), variant: 0.9,
            });
            cyanBatch.add({ x: bx, y: 0.4 + h + 0.3, z: bz, w: tw * 1.04, h: 0.5, d: td * 1.04, color: '#00e5ff' });
            h += th;
            towers[towers.length - 1].h = h;
          }
          // Neon edges on most tall towers.
          if (h > 50) {
            const colorPick = rng.next();
            const batch = colorPick < 0.45 ? cyanBatch : colorPick < 0.8 ? magentaBatch : warmBatch;
            const edgeColor = colorPick < 0.45 ? '#00e5ff' : colorPick < 0.8 ? '#ff2bd6' : '#ffb347';
            const sides = rng.chance(0.55) ? 2 : 1;
            for (let s = 0; s < sides; s++) {
              const side = rng.int(0, 3);
              const ox = side === 0 ? -w / 2 : side === 1 ? w / 2 : 0;
              const oz = side === 2 ? -d / 2 : side === 3 ? d / 2 : 0;
              batch.add({
                x: bx + ox * 0.98, y: 0.4, z: bz + oz * 0.98,
                w: 1.0, h: h * rng.range(0.72, 1), d: 1.0,
                color: edgeColor,
              });
            }
            if (rng.chance(0.6)) {
              const y = 0.4 + h * rng.range(0.35, 0.85);
              batch.add({
                x: bx, y, z: bz + d / 2 + 0.2, w: w, h: 0.5, d: 0.35,
                color: edgeColor,
              });
            }
            // Street-level neon strip.
            if (rng.chance(0.4)) {
              batch.add({
                x: bx, y: 1.4, z: bz + d / 2 + 0.35, w: w * 0.86, h: 0.8, d: 0.3,
                color: edgeColor,
              });
            }
          }
          if (h > 150) {
            ctx.sphere(beacon, 0.5, bx, 0.4 + h + 1, bz, 6);
          }
        }
      }
    }

    // Skybridges between nearby supertalls.
    let bridges = 0;
    for (let i = 0; i < towers.length && bridges < 10; i++) {
      const a = towers[i];
      if (a.h < 80) continue;
      for (let j = i + 1; j < towers.length && bridges < 10; j++) {
        const b = towers[j];
        if (b.h < 80) continue;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        if (dist > 60 || dist < 18) continue;
        if (!rng.chance(0.35)) continue;
        const y = 0.4 + Math.min(a.h, b.h) * rng.range(0.45, 0.7);
        const midX = (a.x + b.x) / 2;
        const midZ = (a.z + b.z) / 2;
        const angle = Math.atan2(b.x - a.x, b.z - a.z);
        ctx.box(deckMat, 3.4, 2.4, dist, midX, y, midZ, angle);
        ctx.box(rng.chance(0.5) ? neonCyan : neonMagenta, 0.4, 0.4, dist, midX, y + 2.4, midZ, angle);
        bridges++;
        break;
      }
    }

    // LED billboards on a few tower faces, facing the bay.
    const screens = [
      { x: -70, z: -20, y: 52, w: 20, h: 30 },
      { x: 40, z: 4, y: 74, w: 16, h: 26 },
      { x: 128, z: -30, y: 60, w: 18, h: 28 },
      { x: -150, z: 12, y: 44, w: 14, h: 22 },
    ];
    for (let i = 0; i < screens.length; i++) {
      const s = screens[i];
      const mat = createLedScreenMaterial(i % 2 === 0 ? '#ff2bd6' : '#00e5ff', i % 2 === 0 ? '#00e5ff' : '#ff2bd6');
      ctx.materials.push(mat);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
      screen.position.set(s.x, s.y + 20, s.z + 9);
      ctx.world.add(screen);
      ctx.ticker((elapsed) => {
        if (mat.userData.uniforms) mat.userData.uniforms.uTime.value = elapsed;
      });
    }
    // Vertical "深圳" neon sign.
    const signTex = ctx.addTexture(makeTextTexture('深圳', {
      width: 512, height: 240, color: '#f4fdff', glow: '#ff2bd6',
      font: '700 170px "Microsoft YaHei", "PingFang SC", sans-serif',
    }));
    const signMat = new THREE.MeshBasicMaterial({
      map: signTex, transparent: true, side: THREE.DoubleSide,
      color: new THREE.Color(3.0, 2.4, 3.2),
    });
    signMat.userData.disposeOnClear = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(52, 24), signMat);
    sign.position.set(0, 112, 84.9);
    ctx.world.add(sign);
    ctx.box(deckMat, 55, 26, 1.2, 0, 99, 84);
    // Floating holographic billboards along the bay.
    for (let i = 0; i < 3; i++) {
      const mat = createLedScreenMaterial(i % 2 === 0 ? '#00e5ff' : '#ff2bd6', i % 2 === 0 ? '#ff2bd6' : '#00e5ff');
      ctx.materials.push(mat);
      const w = 30 + i * 6;
      const h = 20 + i * 4;
      const px = -150 + i * 140;
      const py = 58 + i * 14;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plane.position.set(px, py, 93.4);
      ctx.world.add(plane);
      ctx.box(deckMat, w + 2, 2, 1.4, px, py + h / 2, 92);
      ctx.box(deckMat, w + 2, 2, 1.4, px, py - h / 2, 92);
      ctx.ticker((elapsed) => {
        if (mat.userData.uniforms) mat.userData.uniforms.uTime.value = elapsed;
      });
    }
    ctx.label('华强北', '霓虹街区', 50, 46, 46);
    ctx.label('深圳湾', '科技湾岸', -120, 22, 88);

    // Segmented waterfront promenade, with piers reaching into the bay.
    for (let i = 0; i < 13; i++) {
      const x = -300 + i * 50;
      ctx.box(i % 2 === 0 ? neonCyan : neonMagenta, 24, 0.5, 0.8, x, 1.4, 84);
      ctx.box(deckMat, 6, 0.6, 18, x, 1.1, 92);
      ctx.lamp(x, 2.2, 94, i % 2 === 0 ? '#8ff4ff' : '#ff9fe8', 0.9);
    }
    // Soft neon pools on the bay surface.
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = 128;
    poolCanvas.height = 128;
    const pctx = poolCanvas.getContext('2d');
    const pgrad = pctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    pgrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    pgrad.addColorStop(0.4, 'rgba(255,255,255,0.24)');
    pgrad.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = pgrad;
    pctx.fillRect(0, 0, 128, 128);
    const poolTex = ctx.addTexture(new THREE.CanvasTexture(poolCanvas));
    poolTex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 18; i++) {
      const t = towers[i * 9 % Math.max(1, towers.length)];
      if (!t) continue;
      const mat = new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending,
        depthWrite: false, color: new THREE.Color(i % 2 === 0 ? '#00e5ff' : '#ff2bd6').multiplyScalar(1.4),
      });
      mat.userData.disposeOnClear = true;
      ctx.materials.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(14, 30), rng.range(70, 130)), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(t.x + rng.range(-15, 15), 0.16, 150 + rng.range(-30, 30));
      ctx.world.add(plane);
    }

    // ------- flying vehicles -------
    const flyCount = 46;
    const flyPositions = new Float32Array(flyCount * 3);
    const flyColors = new Float32Array(flyCount * 3);
    const flySeeds = [];
    for (let i = 0; i < flyCount; i++) {
      const c = new THREE.Color(rng.chance(0.5) ? '#ff7fe0' : '#7fe9ff');
      flyColors[i * 3] = c.r;
      flyColors[i * 3 + 1] = c.g;
      flyColors[i * 3 + 2] = c.b;
      flySeeds.push({
        a: rng.range(0, Math.PI * 2),
        r: rng.range(80, 300),
        h: rng.range(55, 190),
        speed: rng.range(0.08, 0.22) * (rng.chance(0.5) ? 1 : -1),
        bob: rng.range(0, Math.PI * 2),
      });
    }
    const flyGeo = new THREE.BufferGeometry();
    flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPositions, 3));
    flyGeo.setAttribute('color', new THREE.BufferAttribute(flyColors, 3));
    const flyMat = new THREE.PointsMaterial({
      size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    flyMat.userData.disposeOnClear = true;
    const fly = new THREE.Points(flyGeo, flyMat);
    fly.frustumCulled = false;
    ctx.world.add(fly);
    ctx.ticker((elapsed) => {
      for (let i = 0; i < flyCount; i++) {
        const f = flySeeds[i];
        const a = f.a + elapsed * f.speed;
        flyPositions[i * 3] = Math.cos(a) * f.r;
        flyPositions[i * 3 + 1] = f.h + Math.sin(elapsed * 1.5 + f.bob) * 3.5;
        flyPositions[i * 3 + 2] = Math.sin(a) * f.r - 40;
      }
      flyGeo.attributes.position.needsUpdate = true;
    });

    // ------- elevated maglev -------
    const magPts = [
      new THREE.Vector3(-280, 21, -150),
      new THREE.Vector3(-140, 21, -120),
      new THREE.Vector3(0, 21, -86),
      new THREE.Vector3(130, 21, -50),
      new THREE.Vector3(280, 21, -10),
    ];
    const magCurve = new THREE.CatmullRomCurve3(magPts);
    const sampled = magCurve.getPoints(80);
    for (const lift of [0, 2.4]) {
      const railPts = sampled.map((p) => ({ x: p.x, y: p.y + lift, z: p.z }));
      const geo = new THREE.BufferGeometry().setFromPoints(railPts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(lift === 0 ? '#00e5ff' : '#ff2bd6'),
        transparent: true,
        opacity: 0.9,
      }));
      ctx.world.add(line);
    }
    for (let i = 0; i < sampled.length; i += 4) {
      const p = sampled[i];
      ctx.box(deckMat, 2, p.y - 0.4, 2, p.x, 0.4, p.z);
    }
    const magMat = ctx.mat('maglev', { color: '#c8d6e2', roughness: 0.25, metalness: 0.7 });
    const magGlow = ctx.glow('maglev-glow', '#00e5ff', 1, 3);
    const pods = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 8, 4, 8), magMat);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 0.5), magGlow);
      strip.position.y = 1.2;
      g.add(strip);
      ctx.world.add(g);
      pods.push({ g, off: i / 3 });
    }
    ctx.ticker((elapsed) => {
      for (const pod of pods) {
        const t = (elapsed * 0.035 + pod.off) % 1;
        const p = magCurve.getPointAt(t);
        const tan = magCurve.getTangentAt(t);
        pod.g.position.set(p.x, p.y + 3, p.z);
        pod.g.rotation.y = Math.atan2(tan.x, tan.z);
      }
    });

    // ------- glowing puddles -------
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const cctx = canvas.getContext('2d');
    const grad = cctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 128, 128);
    const glowTex = ctx.addTexture(new THREE.CanvasTexture(canvas));
    glowTex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 14; i++) {
      const color = i % 2 === 0 ? '#ff2bd6' : '#00e5ff';
      const mat = new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending,
        depthWrite: false, color: new THREE.Color(color),
      });
      mat.userData.disposeOnClear = true;
      ctx.materials.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(26, 52), rng.range(26, 52)), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(rng.range(-220, 220), 0.62, rng.range(-200, 60));
      ctx.world.add(plane);
    }

    // Bay reflections / boats.
    const boatMat = ctx.mat('boat', { color: '#2c3138', roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const b = ctx.box(boatMat, rng.range(10, 20), 2.4, rng.range(4, 6), rng.range(-220, 220), 0.5, rng.range(96, 160));
      b.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), neonWarm));
    }
    for (let i = 0; i < 80; i++) {
      const x = rng.range(-260, 260);
      const z = rng.range(-250, 70);
      if (Math.hypot(x - paX, z - paZ) < 34) continue;
      ctx.tree(x, 0.4, z, rng.range(0.6, 1), 'round', '#3d5c3c');
    }
  },
};
