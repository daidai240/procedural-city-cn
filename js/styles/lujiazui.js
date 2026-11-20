import * as THREE from 'three';
import { clamp } from '../rng.js';
import { twistedTowerGeometry } from '../geom.js';
import { addRoad, addStreetGrid, addLampsAlong } from './shared.js';

const PALETTE = {
  day: {
    skyTop: '#4f8cc9', skyHorizon: '#cfe2ee', skyBottom: '#a8bccb', sunColor: '#fff4dc',
    fogColor: '#c2d5e2', hemiSky: '#b8d6f0', hemiGround: '#4a4640', horizonGlow: '#fff0d8',
    waterDeep: '#173743', waterShallow: '#3e6a79', sunIntensity: 2.0, hemiIntensity: 0.85,
  },
  dusk: {
    skyTop: '#2f3f6e', skyHorizon: '#ffb08a', skyBottom: '#6c5f77', sunColor: '#ffc9a0',
    fogColor: '#b3929a', hemiSky: '#aebcd8', hemiGround: '#3a3338', horizonGlow: '#ff9d7a',
    waterDeep: '#22303f', waterShallow: '#6b5a67', sunIntensity: 1.25, hemiIntensity: 0.62,
  },
  night: {
    skyTop: '#050a16', skyHorizon: '#122238', skyBottom: '#080d16', sunColor: '#9fb8e0',
    fogColor: '#0c1622', hemiSky: '#2a4266', hemiGround: '#332a2c', horizonGlow: '#3a5a9a',
    waterDeep: '#071019', waterShallow: '#12283a', sunIntensity: 0.32, hemiIntensity: 0.55,
  },
  nightCityGlow: 0.4,
  nightGlowColor: '#6f8fff',
};

function addStrut(ctx, a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 8, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  ctx.world.add(mesh);
  return mesh;
}

export default {
  id: 'lujiazui',
  index: '02',
  name: '陆家嘴',
  en: 'LUJIAZUI',
  sub: '上海 · 天际线',
  tagline: '东方明珠 · 三件套 · 黄浦江',
  accent: '#5fb7ff',
  accent2: '#cfeaff',
  accentRgb: '95, 183, 255',
  fogScale: 0.7,
  exposure: 1.04,
  waterReflect: 0.32,
  env: PALETTE,
  hasWater: true,
  patterns: [
    { value: 'grid', label: '棋盘街区' },
    { value: 'radial', label: '环状放射' },
    { value: 'organic', label: '自由路网' },
  ],
  defaults: {
    density: 0.82, block: 1.0, avgHeight: 1.12, heightVar: 0.62,
    commercial: 0.72, residential: 0.23, industrial: 0.05,
    water: 0.95, parks: 0.1, terrain: 0.04, time: 0.72, fog: 0.2,
  },
  views: [
    { key: 'bund', label: '外滩对望', pos: [180, 210, 600], target: [8, 58, -5] },
    { key: 'aerial', label: '天际线航拍', pos: [320, 280, 480], target: [8, 42, -5] },
    { key: 'river', label: '滨江步道', pos: [140, 62, 320], target: [16, 40, -10] },
  ],

  build(ctx) {
    const { rng, params } = ctx;
    const S = params.size;

    // ------- land / river / promenade -------
    const groundMat = ctx.mat('ground', { color: '#2b2f33', roughness: 0.92 });
    ctx.box(groundMat, 2000, 2, 2000, 0, -2.6, 0);
    ctx.box(groundMat, 520, 3.4, 280, 0, -2.6, -76);
    // South bank (the viewer stands on the Bund side).
    ctx.box(groundMat, 1000, 3, 720, 0, -2.4, 560);
    // Riverbank wall + riverside promenade.
    const bankMat = ctx.mat('bank', { color: '#6d6f6c', roughness: 0.9 });
    ctx.box(bankMat, 520, 4.2, 2.4, 0, 0.4, 64);
    const promMat = ctx.mat('promenade', { color: '#8d908c', roughness: 0.9 });
    ctx.box(promMat, 500, 0.55, 15, 0, 0.28, 54);
    for (let x = -230; x <= 230; x += 16) {
      ctx.lamp(x, 2.2, 51.5, '#ffe0b0', 1.1);
      ctx.tree(x + 6, 0.4, 59, 0.75, 'round', '#527a4a');
    }
    // Jetties.
    for (const x of [-130, 10, 150]) {
      ctx.box(bankMat, 26, 1.2, 22, x, 1.2, 74);
      ctx.lamp(x + 11, 2, 82, '#9fd8ff', 1);
    }

    // ------- materials -------
    const glass = ctx.facade('glass', {
      winA: '#d4e9ff', winB: '#ffe3b4', floorH: 4.3, colW: 3.1, lit: 0.45,
      roughness: 0.2, metalness: 0.55, rim: 0.14, rimColor: '#a9d7ff', glow: 1.4,
    });
    const blueGlass = ctx.facade('blue', {
      winA: '#bfe6ff', winB: '#9ad7ff', floorH: 4.0, colW: 2.8, lit: 0.35,
      roughness: 0.16, metalness: 0.62, rim: 0.18, rimColor: '#8fd0ff', glow: 1.2,
    });
    const stone = ctx.facade('stone', {
      winA: '#ffe2ab', winB: '#ffc880', floorH: 3.4, colW: 2.6, lit: 0.62,
      roughness: 0.85, metalness: 0.03, glow: 1.3,
    });
    const towerGlass = ctx.mat('tower-glass', { color: '#8fb6cf', roughness: 0.18, metalness: 0.55 });
    const towerGlass2 = ctx.mat('tower-glass2', { color: '#a9c4d4', roughness: 0.14, metalness: 0.62, emissive: '#1b3a55', emissiveIntensity: 0.55 });
    const gold = ctx.mat('gold', { color: '#b79a68', roughness: 0.32, metalness: 0.8 });
    const darkMetal = ctx.mat('dark-metal', { color: '#6f7780', roughness: 0.4, metalness: 0.7 });
    const concrete = ctx.mat('concrete', { color: '#9c9a94', roughness: 0.9 });
    const glowCool = ctx.glow('cool', '#8fd8ff', 1, 2.4);
    const glowWarm = ctx.glow('warm', '#ffd28a', 1, 2.2);
    const beacon = ctx.glow('beacon', '#ff4a3a', 0.95, 2.6);
    const pearlMat = ctx.mat('pearl', { color: '#dbe5ea', roughness: 0.2, metalness: 0.4, emissive: '#ff5f8a', emissiveIntensity: 0.12 });
    const pearlShaft = ctx.mat('pearl-shaft', { color: '#c7d3da', roughness: 0.24, metalness: 0.45 });

    // ------- Oriental Pearl -------
    const opX = -58;
    const opZ = 44;
    const opBase = 0.5;
    ctx.cylinder(concrete, 16, 18, 4, opX, opBase, opZ, 24);
    const legTop = new THREE.Vector3(opX, opBase + 54, opZ);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const foot = new THREE.Vector3(opX + Math.cos(a) * 15, opBase + 2, opZ + Math.sin(a) * 15);
      addStrut(ctx, foot, legTop, 2.7, pearlShaft);
      ctx.lamp(opX + Math.cos(a) * 15, opBase + 5, opZ + Math.sin(a) * 15, '#ff9dc0', 1.1);
    }
    ctx.cylinder(pearlShaft, 3.2, 5.0, 178, opX, opBase, opZ, 20);
    const pearlSphere = (y, r, color) => {
      const m = ctx.mat(`pearl-${y}`, { color, roughness: 0.24, metalness: 0.4, emissive: '#ff5f8a', emissiveIntensity: 0.18 });
      ctx.sphere(m, r, opX, y, opZ, 24);
      // glowing ring around each sphere
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.03, 0.42, 8, 40), glowCool);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(opX, y, opZ);
      ctx.world.add(ring);
    };
    pearlSphere(opBase + 33, 8.6, '#e2ebef');
    pearlSphere(opBase + 82, 14.5, '#eaf2f5');
    pearlSphere(opBase + 136, 7.6, '#e2ebef');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      ctx.sphere(pearlMat, 5.2, opX + Math.cos(a) * 10.5, opBase + 15, opZ + Math.sin(a) * 10.5, 14);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.box(glowCool, 0.3, 165, 0.3, opX + Math.cos(a) * 4.8, opBase + 5, opZ + Math.sin(a) * 4.8);
    }
    ctx.cylinder(pearlShaft, 0.5, 1.1, 30, opX, opBase + 140, opZ, 8);
    ctx.sphere(beacon, 0.9, opX, opBase + 172, opZ, 8);
    ctx.label('东方明珠', '468m · 1994', opX, opBase + 162, opZ);

    // ------- Shanghai Tower (twisted) -------
    const stX = 20;
    const stZ = -18;
    const stGeo = twistedTowerGeometry({
      height: 178, baseRadius: 17, topRadius: 11.5, twist: Math.PI * 0.95, rings: 36, sides: 26, power: 3.2,
    });
    const st = new THREE.Mesh(stGeo, towerGlass2);
    st.position.set(stX, 0.4, stZ);
    ctx.world.add(st);
    // Luminous edge that traces the tower's twist.
    const helixPts = [];
    for (let i = 0; i <= 95; i++) {
      const t = i / 95;
      const ang = t * Math.PI * 0.95 + 0.8;
      const rr = 17 + (11.5 - 17) * t + 0.7;
      helixPts.push(new THREE.Vector3(stX + Math.cos(ang) * rr, t * 178 + 0.4, stZ + Math.sin(ang) * rr));
    }
    const helix = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(helixPts),
      new THREE.LineBasicMaterial({ color: new THREE.Color('#9fe4ff'), transparent: true, opacity: 0.85 })
    );
    ctx.world.add(helix);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(11.8, 0.5, 8, 40), glowCool);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(stX, 178.4, stZ);
    ctx.world.add(crown);
    ctx.label('上海中心', '632m · 中国第一高', stX, 192, stZ);

    // ------- SWFC (bottle opener) -------
    const swX = 72;
    const swZ = 6;
    const swW = 15;
    ctx.box(towerGlass, swW, 152, 22, swX - 12, 0.4, swZ);
    ctx.box(towerGlass, swW, 152, 22, swX + 12, 0.4, swZ);
    ctx.box(towerGlass, 40, 16, 22, swX, 152.4, swZ);
    ctx.box(darkMetal, 40, 2, 23, swX, 168.4, swZ);
    ctx.box(glowCool, 2.4, 0.5, 23, swX - 12, 158, swZ);
    ctx.box(glowCool, 2.4, 0.5, 23, swX + 12, 158, swZ);
    ctx.label('环球金融中心', '492m · 开瓶器', swX, 182, swZ);

    // ------- Jin Mao (pagoda tiers) -------
    const jmX = -18;
    const jmZ = -48;
    let jmY = 0.4;
    for (let i = 0; i < 13; i++) {
      const w = 27 - i * 1.35;
      const h = i === 12 ? 8 : 9.6;
      ctx.box(i % 2 === 0 ? gold : darkMetal, w, h, w, jmX, jmY, jmZ);
      ctx.box(glowWarm, w + 1.2, 0.35, w + 1.2, jmX, jmY + h - 0.6, jmZ);
      jmY += h;
    }
    ctx.cylinder(darkMetal, 0.6, 1.6, 18, jmX, jmY, jmZ, 8);
    ctx.label('金茂大厦', '421m · 宝塔造型', jmX, jmY + 22, jmZ);

    // ------- Generic CBD towers -------
    const centers = [
      { x: 0, z: 30, w: 20, d: 20, h: 128, mat: blueGlass, color: '#7fa6c2' },
      { x: 52, z: 40, w: 18, d: 18, h: 112, mat: glass, color: '#8fb0c4' },
      { x: -18, z: 52, w: 16, d: 20, h: 96, mat: blueGlass, color: '#7c9db4' },
      { x: 106, z: -6, w: 17, d: 17, h: 138, mat: glass, color: '#8baec6' },
      { x: 130, z: 34, w: 15, d: 15, h: 104, mat: blueGlass, color: '#7d9fb6' },
      { x: -86, z: 22, w: 17, d: 17, h: 118, mat: glass, color: '#8aa8bc' },
      { x: -112, z: -20, w: 14, d: 14, h: 92, mat: blueGlass, color: '#7f9db2' },
    ];
    for (const t of centers) {
      ctx.addBuilding('cbd', t.mat, {
        x: t.x, y: 0.4, z: t.z, w: t.w, h: t.h, d: t.d,
        color: t.color, lit: 0.6, seed: rng.next(), variant: rng.next(),
      });
      ctx.box(t.w > 16 ? glowCool : glowWarm, t.w + 0.8, 0.45, t.d + 0.8, t.x, t.h, t.z);
    }

    // ------- Street grid + generic blocks -------
    const x0 = -240 * S;
    const x1 = 240 * S;
    const z0 = -205;
    const z1 = 52;
    const spacingX = 34 / Math.sqrt(params.density) * (0.9 + params.block * 0.2);
    const spacingZ = 30 / Math.sqrt(params.density) * (0.9 + params.block * 0.2);

    const pattern = params.pattern;
    if (pattern === 'radial') {
      const c = { x: 20, z: 10 };
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const pts = [
          { x: c.x + Math.cos(a) * 12, y: 0.62, z: c.z + Math.sin(a) * 12 },
          { x: c.x + Math.cos(a) * 110, y: 0.62, z: c.z + Math.sin(a) * 110 },
          { x: c.x + Math.cos(a) * 240, y: 0.62, z: c.z + Math.sin(a) * 240 },
        ];
        addRoad(ctx, pts, { width: 8, lamps: true, lampSpacing: 26, divisions: 48 });
      }
      for (let r = 42; r <= 190; r += 38) {
        const pts = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          pts.push({ x: c.x + Math.cos(a) * r, y: 0.62, z: c.z + Math.sin(a) * r });
        }
        addRoad(ctx, pts, { width: 6.5, lamps: false, divisions: 56 });
      }
    } else {
      addStreetGrid(ctx, {
        x0, x1, z0, z1, spacingX, spacingZ, width: 7,
        jitter: pattern === 'organic' ? 6 : 0,
      });
    }

    const reserved = [
      [opX, opZ, 34], [stX, stZ, 36], [swX, swZ, 34], [jmX, jmZ, 32],
    ];
    const blocked = (x, z, r) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + r);

    const startX = Math.ceil(x0 / spacingX) * spacingX;
    const startZ = Math.ceil(z0 / spacingZ) * spacingZ;
    for (let bx = startX; bx < x1; bx += spacingX) {
      for (let bz = startZ; bz < z1; bz += spacingZ) {
        const w = spacingX * 0.72;
        const d = spacingZ * 0.72;
        const columns = Math.max(2, Math.round(w / 13));
        const rows = Math.max(1, Math.round(d / 13));
        for (let i = 0; i < columns; i++) {
          for (let j = 0; j < rows; j++) {
            if (rng.next() > 0.12 + params.density * 0.9) continue;
            const x = bx + (i + 0.5) * (w / columns) + rng.range(-2, 2);
            const z = bz + (j + 0.5) * (d / rows) + rng.range(-2, 2);
            if (blocked(x, z, 2)) continue;
            const dist = Math.hypot(x - 30, z - 4);
            const centerBias = clamp(1.25 - dist / 300, 0.25, 1);
            const hv = 1 + (rng.next() - 0.5) * params.heightVar * 1.6;
            let h = rng.range(24, 78) * centerBias * hv * params.avgHeight;
            if (dist < 130 && rng.next() < 0.35) h = rng.range(70, 150) * hv * params.avgHeight;
            h = clamp(h, 14, 185);
            const isOffice = rng.next() < params.commercial / Math.max(0.001, params.commercial + params.residential);
            const ww = rng.range(10, Math.min(19, w / columns - 2));
            const dd = rng.range(10, Math.min(18, d / rows - 2));
            ctx.addBuilding(isOffice ? 'tower' : 'res', isOffice ? glass : stone, {
              x, y: 0.4, z, w: ww, h, d: dd,
              color: isOffice ? rng.pick(['#7fa4bc', '#8db0c4', '#7593a8', '#93b2c4']) : rng.pick(['#b8b1a4', '#a9a296', '#c3bbac']),
              lit: rng.range(0.35, 0.75), seed: rng.next(), variant: rng.next(),
            });
            if (h > 60) {
              ctx.box(rng.chance(0.5) ? glowCool : glowWarm, ww * 0.4, 0.35, dd * 0.4, x, h, z);
              if (h > 130) ctx.sphere(beacon, 0.45, x, h + 2, z, 6);
            }
          }
        }
      }
    }

    // ------- South-bank promenade (the Bund sits behind this view) -------
    const railingMat = ctx.mat('railing', { color: '#8c8d88', roughness: 0.75 });
    ctx.box(railingMat, 560, 0.9, 1.2, 0, 1.3, 224);
    for (let x = -270; x <= 270; x += 18) {
      ctx.lamp(x, 2.4, 222, '#ffd9a0', 0.85);
      if (x % 36 === 0) ctx.tree(x + 8, 0.4, 236, rng.range(0.8, 1.2), 'round', '#4c7444');
    }
    // Low Bund promenade in the foreground, framed by trees.
    ctx.box(promMat, 620, 0.5, 28, 0, 0.55, 244);
    for (let x = -290; x <= 290; x += 20) {
      ctx.lamp(x, 1.7, 238, '#ffd9a0', 0.9);
      if (x % 40 === 0) ctx.tree(x + 9, 0.9, 256, rng.range(0.8, 1.2), 'round', '#4c7444');
    }
    ctx.label('外滩', '万国建筑博览群', 120, 14, 244);

    // Trees + boats.
    for (let i = 0; i < 80; i++) {
      const x = rng.range(-210, 210);
      const z = rng.range(-150, 44);
      ctx.tree(x, 0.4, z, rng.range(0.55, 0.9), 'round', '#4c7444');
    }
    const boatCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-260, 2.4, 92), new THREE.Vector3(-60, 2.4, 100),
      new THREE.Vector3(120, 2.4, 106), new THREE.Vector3(280, 2.4, 118),
    ]);
    const boatMat = ctx.mat('boat', { color: '#4a4f55', roughness: 0.7 });
    const boatLight = ctx.glow('boat-light', '#ffe0a8', 1, 2.4);
    const boats = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 4.6), boatMat);
      g.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 3.6), boatMat);
      cabin.position.y = 2.4;
      g.add(cabin);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), boatLight);
      light.position.set(6, 1.8, 0);
      g.add(light);
      ctx.world.add(g);
      boats.push({ g, off: rng.next() });
    }
    ctx.ticker((elapsed) => {
      for (const b of boats) {
        const t = (elapsed * 0.006 + b.off) % 1;
        const p = boatCurve.getPointAt(t);
        const tan = boatCurve.getTangentAt(t);
        b.g.position.copy(p);
        b.g.rotation.y = Math.atan2(tan.x, tan.z);
      }
    });

    // A few neon crowns near the waterline.
    for (let i = 0; i < 10; i++) {
      const x = rng.range(-180, 180);
      const z = rng.range(-100, 30);
      ctx.box(glowCool, 12, 0.35, 2, x, rng.range(20, 60), z);
    }
  },
};
