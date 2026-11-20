import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';

import { STYLES, STYLE_MAP, DEFAULT_SEED } from './styles/index.js';
import { Environment } from './environment.js';
import { BuildContext } from './context.js';
import { RNG, hashString, clamp, easeInOutCubic, pickSeed } from './rng.js';
import { disposeGroup } from './geom.js';

const canvas = document.getElementById('scene');
const labelsRoot = document.getElementById('labels');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const transition = document.getElementById('transition');
const transitionName = document.getElementById('transition-name');
const transitionSub = document.getElementById('transition-sub');
const transitionEn = document.getElementById('transition-en');
const toast = document.getElementById('toast');
const panel = document.getElementById('panel');
const panelOpen = document.getElementById('panel-open');
const panelClose = document.getElementById('panel-close');
const presetGrid = document.getElementById('preset-grid');
const viewRow = document.getElementById('view-row');
const controlsRoot = document.getElementById('controls');
const seedInput = document.getElementById('seed-input');
const seedDice = document.getElementById('seed-dice');
const btnRegen = document.getElementById('btn-regen');
const tgRotate = document.getElementById('tg-rotate');
const tgLabels = document.getElementById('tg-labels');
const tgBloom = document.getElementById('tg-bloom');
const statSeed = document.getElementById('stat-seed');
const statBuildings = document.getElementById('stat-buildings');
const statFps = document.getElementById('stat-fps');
const statCamera = document.getElementById('stat-camera');
const cityName = document.getElementById('city-name');
const citySub = document.getElementById('city-sub');
const cityIndex = document.getElementById('city-index');
const btnDayNight = document.getElementById('btn-daynight');
const modeLabel = document.getElementById('mode-label');

// The one-click day / night switch jumps between two canonical looks: the same
// 0.2 daylight and 0.9 deep-night values used by the screenshot scenarios. Any
// time at or past the halfway point of the timeline already has dusk/night
// lighting, so the button offers daylight from there.
const DAY_TIME = 0.2;
const NIGHT_TIME = 0.9;
const NIGHT_MODE_FROM = 0.5;

const SLIDERS = {
  size: { min: 0.6, max: 1.6, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  density: { min: 0.2, max: 1, step: 0.01, fmt: pct },
  block: { min: 0.6, max: 1.5, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  avgHeight: { min: 0.5, max: 1.6, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  heightVar: { min: 0, max: 1, step: 0.01, fmt: pct },
  commercial: { min: 0, max: 1, step: 0.01, fmt: pct },
  residential: { min: 0, max: 1, step: 0.01, fmt: pct },
  industrial: { min: 0, max: 1, step: 0.01, fmt: pct },
  water: { min: 0, max: 1, step: 0.01, fmt: pct },
  parks: { min: 0, max: 0.5, step: 0.01, fmt: pct },
  terrain: { min: 0, max: 1, step: 0.01, fmt: pct },
  time: { min: 0, max: 1, step: 0.01, fmt: timeLabel },
  fog: { min: 0, max: 1, step: 0.01, fmt: pct },
};

const SECTIONS = [
  {
    title: '布局', en: 'LAYOUT',
    items: [
      { key: 'size', label: '城市规模' },
      { key: 'density', label: '建筑密度' },
      { key: 'block', label: '街区尺度' },
      { key: 'pattern', label: '街道模式', type: 'select' },
    ],
  },
  {
    title: '天际线', en: 'SKYLINE',
    items: [
      { key: 'avgHeight', label: '平均高度' },
      { key: 'heightVar', label: '高度差异' },
    ],
  },
  {
    title: '功能分区', en: 'ZONING',
    items: [
      { key: 'commercial', label: '商业办公' },
      { key: 'residential', label: '住宅社区' },
      { key: 'industrial', label: '工业仓储' },
    ],
  },
  {
    title: '环境', en: 'WORLD',
    items: [
      { key: 'water', label: '水域范围' },
      { key: 'parks', label: '公园绿地' },
      { key: 'terrain', label: '地形起伏' },
      { key: 'time', label: '时间光线' },
      { key: 'fog', label: '雾气浓度' },
    ],
  },
];

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function timeLabel(v) {
  if (v < 0.28) return `白天 ${Math.round(v * 100)}%`;
  if (v < 0.66) return `黄昏 ${Math.round(v * 100)}%`;
  return `夜晚 ${Math.round(v * 100)}%`;
}

function clamp01(v) {
  return clamp(Number.isFinite(v) ? v : 0, 0, 1);
}

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070b');

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 3600);
camera.position.set(90, 138, 372);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 24;
controls.maxDistance = 1500;
controls.maxPolarAngle = Math.PI / 2 - 0.035;
controls.minPolarAngle = 0.12;
controls.autoRotateSpeed = 0.32;
controls.target.set(10, 34, 26);

const env = new Environment(scene);

const composer = new EffectComposer(renderer);
// The composer renders into offscreen targets, so the renderer's `antialias`
// flag does not apply. Multisampling those targets keeps distant rooflines and
// terrain silhouettes smooth instead of stair-stepped.
composer.renderTarget1.samples = 4;
composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.38, 0.55, 0.84
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
renderer.toneMapping = THREE.ACESFilmicToneMapping;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function baseState(style, seed) {
  const s = {
    style: style.id,
    seed: seed ?? DEFAULT_SEED,
    size: 1,
    pattern: style.patterns[0].value,
  };
  for (const key of Object.keys(style.defaults)) s[key] = style.defaults[key];
  return s;
}

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const styleId = params.get('style');
  const style = STYLE_MAP[styleId] || STYLES[0];
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const state = baseState(style, Number.isFinite(seed) ? seed : DEFAULT_SEED);
  for (const key of Object.keys(SLIDERS)) {
    const raw = params.get(key);
    if (raw === null) continue;
    const v = Number.parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    if (key === 'terrain' || key === 'water' || key === 'density' || key === 'commercial' ||
      key === 'residential' || key === 'industrial' || key === 'fog' || key === 'parks' ||
      key === 'time' || key === 'heightVar') {
      state[key] = clamp(v, SLIDERS[key].min, SLIDERS[key].max);
    } else {
      state[key] = clamp(v, SLIDERS[key].min, SLIDERS[key].max);
    }
  }
  const pattern = params.get('pattern');
  if (pattern && style.patterns.some((p) => p.value === pattern)) state.pattern = pattern;
  return state;
}

const state = readHash();
let style = STYLE_MAP[state.style] || STYLES[0];
let world = null;
let ctx = null;
let builtStats = { buildings: 0 };
let currentView = 0;
let rebuildTimer = null;
let hashTimer = null;
let toastTimer = null;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function clearWorld() {
  if (ctx) {
    ctx.dispose();
    ctx = null;
  }
  if (world) {
    scene.remove(world);
    disposeGroup(world);
    world = null;
  }
  labelsRoot.innerHTML = '';
  labelEntries.length = 0;
}

function build() {
  clearWorld();
  style = STYLE_MAP[state.style];
  world = new THREE.Group();
  scene.add(world);
  const seed = hashString(`${style.id}:${state.seed}:${state.pattern}`);
  const rng = new RNG(seed);
  ctx = new BuildContext({ world, style, params: state, rng });
  let stats;
  try {
    style.build(ctx);
    stats = ctx.finalize();
  } catch (err) {
    console.error('[city] build failed', err);
    loaderText.textContent = '生成失败，请刷新重试';
    loader.classList.remove('hidden');
    throw err;
  }
  builtStats = stats;
  renderer.toneMappingExposure = style.exposure ?? 1.02;
  env.setWaterVisible(style.hasWater !== false);
  env.apply(style, state);
  applyNight();
  updateDayNightButton();
  applyLabels(stats.labels || []);
  statBuildings.textContent = stats.buildings.toLocaleString('en-US');
  statSeed.textContent = String(state.seed);
  updateHashSoon();
}

function applyNight() {
  if (!ctx) return;
  const night = env.windowNight;
  // Ground sheen mirrors the sky / city glow so wet streets and riverbanks
  // catch a little light instead of disappearing into black.
  const sheen = new THREE.Color();
  if (env.fogColor) {
    sheen.copy(env.fogColor)
      .lerp(env.skyUniforms.horizonColor.value, 0.55)
      .multiplyScalar(2.2);
  }
  for (const m of ctx.materials) {
    const u = m.userData && m.userData.uniforms;
    if (u && u.uNight) u.uNight.value = night;
    if (u && u.uSheenColor) u.uSheenColor.value.copy(sheen);
  }
  if (ctx.traffic) ctx.traffic.setNight(night);
  if (ctx.lampMaterial) ctx.lampMaterial.opacity = 0.32 + night * 0.72;
  if (bloomPass) bloomPass.strength = (style && style.id === 'shenzhen') ? 0.42 : 0.34 + night * 0.16;
}

// ---------------------------------------------------------------------------
// Day / night mode
// ---------------------------------------------------------------------------
function isNightMode() {
  return state.time >= NIGHT_MODE_FROM;
}

function updateDayNightButton() {
  if (!btnDayNight) return;
  const night = isNightMode();
  btnDayNight.classList.toggle('is-night', night);
  const target = night ? '白天' : '夜间';
  if (modeLabel) modeLabel.textContent = target;
  const label = `切换到${target}模式`;
  btnDayNight.setAttribute('aria-label', label);
  btnDayNight.title = label;
}

function setTimeOfDay(value) {
  state.time = clamp(value, SLIDERS.time.min, SLIDERS.time.max);
  const slider = document.getElementById('ctrl-time');
  if (slider) {
    slider.value = String(state.time);
    updateSliderVisual(slider, 'time');
  }
  env.apply(style, state);
  applyNight();
  updateDayNightButton();
  updateHashSoon();
}

function queueBuild(delay = 130) {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    build();
  }, delay);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
const labelEntries = [];
const _project = new THREE.Vector3();

function applyLabels(labels) {
  labelsRoot.innerHTML = '';
  labelEntries.length = 0;
  for (const label of labels) {
    const el = document.createElement('div');
    el.className = 'landmark';
    el.innerHTML = `<div class="tag"><b>${label.name}</b><span>${label.sub || ''}</span></div><div class="stem"></div><div class="pin"></div>`;
    labelsRoot.appendChild(el);
    labelEntries.push({ el, label });
  }
  labelsRoot.style.display = tgLabels.checked ? 'block' : 'none';
}

function updateLabels() {
  if (!tgLabels.checked) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const entry of labelEntries) {
    const { el, label } = entry;
    _project.set(label.x, label.y, label.z).project(camera);
    if (_project.z > 1 || _project.z < -1 || Math.abs(_project.x) > 1.12 || Math.abs(_project.y) > 1.12) {
      el.style.display = 'none';
      continue;
    }
    const x = (_project.x * 0.5 + 0.5) * w;
    const y = (-_project.y * 0.5 + 0.5) * h;
    const dist = camera.position.distanceTo(new THREE.Vector3(label.x, label.y, label.z));
    el.style.display = 'flex';
    el.style.left = `${x.toFixed(1)}px`;
    el.style.top = `${y.toFixed(1)}px`;
    el.style.opacity = String(clamp(1.25 - dist / 1100, 0.12, 1));
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camTween = {
  active: false,
  t: 0,
  duration: 1.4,
  start: 0,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
};
function flyTo(view, instant = false) {
  if (!view) return;
  const toPos = new THREE.Vector3().fromArray(view.pos);
  const toTarget = new THREE.Vector3().fromArray(view.target);
  if (instant) {
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    controls.update();
    return;
  }
  camTween.active = true;
  camTween.t = 0;
  camTween.start = performance.now();
  camTween.fromPos.copy(camera.position);
  camTween.toPos.copy(toPos);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.copy(toTarget);
}

function updateCamTween() {
  if (!camTween.active) return;
  const elapsed = (performance.now() - camTween.start) / 1000;
  camTween.t = Math.min(1, elapsed / camTween.duration);
  const e = easeInOutCubic(camTween.t);
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
  controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
  if (camTween.t >= 1) camTween.active = false;
}

controls.addEventListener('start', () => {
  camTween.active = false;
});

function pickView(index, instant = false) {
  const views = style.views;
  currentView = index;
  flyTo(views[index], instant);
  viewRow.querySelectorAll('.view-btn').forEach((b, i) => {
    b.classList.toggle('active', i === index);
  });
  statCamera.textContent = views[index].label;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function buildPresets() {
  presetGrid.innerHTML = '';
  STYLES.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = `preset${i === 0 ? ' featured' : ''}`;
    btn.dataset.style = s.id;
    btn.style.setProperty('--preset-accent', s.accent);
    const night = s.env.night;
    const accent = s.accent;
    btn.innerHTML = `
      <div class="art" style="background:
        radial-gradient(120% 100% at 80% 0%, ${hexAlpha(accent, 0.42)}, transparent 62%),
        linear-gradient(150deg, ${night.skyTop} 0%, ${night.skyHorizon} 55%, #060a10 100%);">
        <div class="skyline" style="color:${accent}">
          ${[34, 62, 48, 86, 70, 96, 56, 76, 44, 64].map((h) => `<i style="height:${h}%;opacity:${0.22 + h / 260}"></i>`).join('')}
        </div>
      </div>
      <span class="idx">${s.index}</span>
      ${i === 0 ? '<span class="badge">主推</span>' : ''}
      <span class="label"><b>${s.name}</b><span>${s.sub}</span></span>
    `;
    btn.addEventListener('click', () => switchStyle(s.id));
    presetGrid.appendChild(btn);
  });
}

function hexAlpha(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderControls() {
  controlsRoot.innerHTML = '';
  for (const section of SECTIONS) {
    const block = document.createElement('section');
    block.className = 'block';
    block.innerHTML = `<div class="block-title"><span>${section.title}</span><em>${section.en}</em></div>`;
    for (const item of section.items) {
      if (item.type === 'select') {
        const wrap = document.createElement('div');
        wrap.className = 'control';
        const options = style.patterns.map((p) => `<option value="${p.value}"${p.value === state.pattern ? ' selected' : ''}>${p.label}</option>`).join('');
        wrap.innerHTML = `<div class="control-head"><label>${item.label}</label></div><select id="ctrl-pattern">${options}</select>`;
        const sel = wrap.querySelector('select');
        sel.disabled = style.patterns.length <= 1;
        sel.addEventListener('change', () => {
          state.pattern = sel.value;
          queueBuild(0);
          updateHashSoon();
        });
        block.appendChild(wrap);
        continue;
      }
      const spec = SLIDERS[item.key];
      const wrap = document.createElement('div');
      wrap.className = 'control';
      wrap.innerHTML = `
        <div class="control-head">
          <label for="ctrl-${item.key}">${item.label}</label>
          <output id="out-${item.key}">${spec.fmt(state[item.key])}</output>
        </div>
        <input type="range" id="ctrl-${item.key}" data-key="${item.key}"
          min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${state[item.key]}" />
      `;
      block.appendChild(wrap);
    }
    controlsRoot.appendChild(block);
  }
  for (const el of controlsRoot.querySelectorAll('input[type="range"]')) {
    const key = el.dataset.key;
    el.addEventListener('input', () => {
      const v = Number.parseFloat(el.value);
      state[key] = v;
      updateSliderVisual(el, key);
      if (key === 'time' || key === 'fog') {
        env.apply(style, state);
        applyNight();
        if (bloomPass) bloomPass.strength = (style.id === 'shenzhen') ? 0.42 : 0.34 + env.windowNight * 0.16;
        updateDayNightButton();
        updateHashSoon();
      } else {
        queueBuild(key === 'pattern' ? 0 : 110);
        updateHashSoon();
      }
    });
    updateSliderVisual(el, key);
  }
}

function updateSliderVisual(el, key) {
  const spec = SLIDERS[key];
  const pctVal = ((Number.parseFloat(el.value) - spec.min) / (spec.max - spec.min)) * 100;
  el.style.setProperty('--fill', `${pctVal}%`);
  const out = document.getElementById(`out-${key}`);
  if (out) out.textContent = spec.fmt(Number.parseFloat(el.value));
}

function syncControls() {
  for (const [key, spec] of Object.entries(SLIDERS)) {
    const el = document.getElementById(`ctrl-${key}`);
    if (!el) continue;
    el.value = String(state[key]);
    updateSliderVisual(el, key);
  }
  const sel = document.getElementById('ctrl-pattern');
  if (sel) {
    sel.innerHTML = style.patterns.map((p) => `<option value="${p.value}"${p.value === state.pattern ? ' selected' : ''}>${p.label}</option>`).join('');
    sel.disabled = style.patterns.length <= 1;
  }
}

function buildViews() {
  viewRow.innerHTML = '';
  style.views.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = `view-btn${i === 0 ? ' active' : ''}`;
    b.textContent = v.label;
    b.addEventListener('click', () => pickView(i));
    viewRow.appendChild(b);
  });
  statCamera.textContent = style.views[0].label;
}

function applyTheme() {
  document.documentElement.style.setProperty('--accent', style.accent);
  document.documentElement.style.setProperty('--accent-2', style.accent2);
  document.documentElement.style.setProperty('--accent-rgb', style.accentRgb);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', style.env.night.skyTop);
}

function updateHeader() {
  cityName.textContent = style.name;
  citySub.textContent = style.sub;
  cityIndex.textContent = `${style.index} / 05 · 中国城市`;
  presetGrid.querySelectorAll('.preset').forEach((b) => {
    b.classList.toggle('active', b.dataset.style === style.id);
  });
  statSeed.textContent = String(state.seed);
  seedInput.value = String(state.seed);
}

async function switchStyle(id) {
  if (id === style.id) return;
  const target = STYLE_MAP[id];
  if (!target) return;
  const previousSeed = state.seed;
  const previousSize = state.size;
  style = target;
  const defaults = baseState(target, previousSeed);
  Object.assign(state, defaults);
  state.size = previousSize;
  state.style = id;
  if (!target.patterns.some((p) => p.value === state.pattern)) state.pattern = target.patterns[0].value;

  updateHeader();
  applyTheme();
  renderControls();
  buildViews();
  showTransition();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  build();
  pickView(0);
  setTimeout(() => transition.classList.remove('show'), 520);
  updateHashSoon();
}

function showTransition() {
  transitionEn.textContent = style.en;
  transitionName.textContent = style.name;
  transitionSub.textContent = style.tagline || style.sub;
  transition.classList.add('show');
}

function updateHashSoon() {
  if (hashTimer) clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const params = new URLSearchParams();
    params.set('style', state.style);
    params.set('seed', String(state.seed));
    for (const key of Object.keys(SLIDERS)) {
      params.set(key, String(Number(state[key].toFixed(3))));
    }
    params.set('pattern', state.pattern);
    history.replaceState(null, '', `#${params.toString()}`);
  }, 220);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
seedInput.addEventListener('change', () => {
  const v = Number.parseInt(seedInput.value.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(v) || v <= 0) {
    seedInput.value = String(state.seed);
    showToast('种子需要是正整数');
    return;
  }
  state.seed = v;
  build();
  updateHeader();
  updateHashSoon();
});

seedDice.addEventListener('click', () => {
  state.seed = pickSeed();
  updateHeader();
  build();
  updateHashSoon();
});

btnRegen.addEventListener('click', () => {
  state.seed = pickSeed();
  updateHeader();
  build();
  updateHashSoon();
  showToast('已生成新城市');
});

tgRotate.addEventListener('change', () => {
  controls.autoRotate = tgRotate.checked;
});

tgLabels.addEventListener('change', () => {
  labelsRoot.style.display = tgLabels.checked ? 'block' : 'none';
});

tgBloom.addEventListener('change', () => {
  if (bloomPass) bloomPass.enabled = tgBloom.checked;
});

btnDayNight.addEventListener('click', () => {
  setTimeOfDay(isNightMode() ? DAY_TIME : NIGHT_TIME);
});

panelClose.addEventListener('click', () => {
  panel.classList.add('hidden');
  panelOpen.hidden = false;
});
panelOpen.addEventListener('click', () => {
  panel.classList.remove('hidden');
  panelOpen.hidden = true;
});

window.addEventListener('keydown', (e) => {
  if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key >= '1' && e.key <= '5') {
    const s = STYLES[Number(e.key) - 1];
    if (s) switchStyle(s.id);
  } else if (e.key === 'r' || e.key === 'R') {
    btnRegen.click();
  } else if (e.code === 'Space') {
    e.preventDefault();
    tgRotate.checked = !tgRotate.checked;
    controls.autoRotate = tgRotate.checked;
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  if (bloomPass) bloomPass.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let elapsed = 0;
let frameCount = 0;

function tick(now) {
  requestAnimationFrame(tick);
  // The first requestAnimationFrame timestamp can predate module evaluation,
  // which would otherwise produce a negative first delta and negative elapsed
  // time (curve samplers expect elapsed >= 0).
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  frameCount++;

  updateCamTween();
  controls.update();
  env.tick(elapsed);
  if (ctx) ctx.update(dt, elapsed);
  updateLabels();

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    statFps.textContent = String(Math.round(fpsFrames / fpsTime));
    fpsFrames = 0;
    fpsTime = 0;
  }

  composer.render();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  buildPresets();
  buildViews();
  renderControls();
  updateHeader();
  applyTheme();
  seedInput.value = String(state.seed);
  labelsRoot.style.display = tgLabels.checked ? 'block' : 'none';
  bloomPass && (bloomPass.enabled = tgBloom.checked);
  controls.autoRotate = tgRotate.checked;
  const startView = style.views[currentView] || style.views[0];
  flyTo(startView, true);
  try {
    build();
  } catch (err) {
    console.error(err);
    return;
  }
  requestAnimationFrame(tick);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      loader.classList.add('hidden');
      window.__CITY_READY__ = true;
    });
  });
}

window.__CITY__ = {
  state,
  STYLES,
  get style() { return style; },
  get ctx() { return ctx; },
  get stats() { return builtStats; },
  get frameCount() { return frameCount; },
  get camTween() { return { active: camTween.active, t: camTween.t, dur: camTween.duration }; },
  setStyle: (id) => switchStyle(id),
  setState: (patch) => {
    Object.assign(state, patch);
    if (patch.style) {
      style = STYLE_MAP[patch.style];
      updateHeader();
      applyTheme();
      renderControls();
      buildViews();
    }
    syncControls();
    updateHeader();
    build();
  },
  regenerate: () => { state.seed = pickSeed(); build(); updateHeader(); },
  camera,
  controls,
  renderer,
  scene,
  env,
  composer,
  build,
};

boot();
