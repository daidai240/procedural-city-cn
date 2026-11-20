import * as THREE from 'three';
import { clamp, lerp } from './rng.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0);

// Builds a flat ribbon that follows a 3D polyline. Used for roads, rails,
// promenades and rivers. Points are THREE.Vector3-like {x,y,z}.
export function ribbonGeometry(points, width, yLift = 0.06) {
  if (points.length < 2) return null;
  const half = width / 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    dir.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    side.crossVectors(up, dir).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);

    const lx = p.x + side.x * half;
    const lz = p.z + side.z * half;
    const rx = p.x - side.x * half;
    const rz = p.z - side.z * half;
    const y = p.y + yLift;
    positions.push(lx, y, lz, rx, y, rz);
    uvs.push(0, i * 0.5, 1, i * 0.5);

    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Dense samples along a polyline, resampled with a Catmull-Rom curve.
export function samplePath(points, divisions = 60, closed = false) {
  const vecs = points.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z));
  const curve = new THREE.CatmullRomCurve3(vecs, closed, 'centripetal', 0.35);
  return curve.getPoints(divisions);
}

export function makeRoad(points, width, material, yLift = 0.08, divisions = 48) {
  const sampled = samplePath(points, divisions);
  const geo = ribbonGeometry(sampled, width, yLift);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  return mesh;
}

// Gabled tiled roof: unit footprint (1 x 1), ridge along X.
export function gableRoofGeometry(height = 1, overhang = 0.12) {
  const w = 0.5 + overhang;
  const d = 0.5 + overhang;
  const h = height;
  const positions = new Float32Array([
    -w, 0, d,   w, 0, d,   w, h, 0,   -w, h, 0,   // front slope
    -w, 0, -d,  -w, h, 0,  w, h, 0,   w, 0, -d,   // back slope
    -w, 0, -d, -w, 0, d,  -w, h, 0,             // left gable
     w, 0, d,   w, 0, -d,  w, h, 0,             // right gable
     -w, 0, -d, -w, 0, d,  w, 0, d,  w, 0, -d,  // bottom
  ]);
  // Manually split into quads for clean normals.
  const idx = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10,
    11, 12, 13,
    14, 15, 16, 14, 16, 17,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Four-sided hip roof (pyramid) with a small overhang. Used for pavilions
// and East-Asian tower roofs.
export function hipRoofGeometry(height = 1, overhang = 0.16, ridge = 0) {
  const r = 0.5 + overhang;
  const geo = new THREE.BufferGeometry();
  const top = ridge;
  const verts = [];
  const idx = [];
  const corners = [
    [-r, 0, r], [r, 0, r], [r, 0, -r], [-r, 0, -r],
  ];
  if (top > 0) {
    // A short ridge along X to give the roof an East-Asian profile.
    verts.push(...corners[0], ...corners[1], ...corners[2], ...corners[3]);
    verts.push(-top, height, 0, top, height, 0);
    const b = 4;
    idx.push(b, 0, 1, b, 1, 5, b, 5, 2, b, 2, 3, b, 3, 0);
    idx.push(4, 0, 3, 4, 3, 2, 4, 2, 1, 4, 1, 0);
  } else {
    verts.push(...corners[0], ...corners[1], ...corners[2], ...corners[3], 0, height, 0);
    idx.push(4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Slightly upturned eave roof: a shallow hip roof plus four raised corner
// wedges. Cheap but reads as a Chinese tiled roof from a distance.
export function curvyRoofGeometry() {
  const g = new THREE.Group();
  return g;
}

export function archBridgeGeometry(span = 20, height = 7, depth = 8, archRatio = 0.62) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(span / 2, height);
  shape.lineTo(-span / 2, height);
  shape.closePath();

  const archW = span * archRatio;
  const archH = height * 0.72;
  const hole = new THREE.Path();
  hole.moveTo(-archW / 2, 0);
  hole.absarc(0, 0, archW / 2, Math.PI, 0, true);
  hole.lineTo(-archW / 2, 0);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

export function makeTextTexture(text, {
  width = 512,
  height = 256,
  bg = 'rgba(0,0,0,0)',
  color = '#ffffff',
  glow = '#ff3fd0',
  font = '600 150px "Microsoft YaHei", "PingFang SC", sans-serif',
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 42;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2 + 4);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, width / 2, height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A twisted tower: stacked superellipse rings. Returns BufferGeometry.
export function twistedTowerGeometry({
  height = 160,
  baseRadius = 14,
  topRadius = 9,
  twist = Math.PI * 0.72,
  rings = 28,
  sides = 24,
  power = 3.4,
  taperBias = 1.0,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = t * height;
    const r = lerp(baseRadius, topRadius, Math.pow(t, taperBias));
    const rot = twist * t;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2 + rot;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Superellipse profile, rounded-square footprint.
      const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / power);
      const cz = Math.sign(s) * Math.pow(Math.abs(s), 2 / power);
      positions.push(cx * r, y, cz * r);
      uvs.push(j / sides, t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Smooth cylindrical tower with optional taper/waist.
export function tubeTowerGeometry({ height, rBottom, rTop, waist = 1, rings = 18, sides = 20 }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = t * height;
    const bulge = 1 + waist * Math.sin(t * Math.PI) * 0.25;
    const r = lerp(rBottom, rTop, t) * bulge;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(j / sides, t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function addBox(group, material, w, h, d, x, y, z, rotY = 0, unitGeo = null) {
  const geo = unitGeo || new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.scale.set(w, h, d);
  group.add(mesh);
  return mesh;
}

export function addCylinder(group, material, rTop, rBottom, h, x, y, z, segments = 16) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y + h / 2, z);
  group.add(mesh);
  return mesh;
}

export function addSphere(group, material, r, x, y, z, seg = 18) {
  const geo = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.isMesh || obj.isPoints || obj.isLine) {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && m.userData && m.userData.disposeOnClear) m.dispose();
      }
    }
  });
}

export function applyInstanceMatrices(mesh, items, positionY = 0) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    _q.setFromEuler(_e.set(0, it.rotY || 0, 0));
    _v.set(it.x, it.y + positionY, it.z);
    _v2.set(it.w, it.h, it.d);
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(_v, _q, _v2));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export { clamp, lerp };
