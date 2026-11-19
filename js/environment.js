import * as THREE from 'three';
import { smoothstep, clamp } from './rng.js';

const C = (hex) => new THREE.Color(hex);
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function mix3(day, dusk, night, key, out, wd, wk, wn) {
  out.copy(day[key]).multiplyScalar(wd);
  _c2.copy(dusk[key]).multiplyScalar(wk);
  out.add(_c2);
  _c2.copy(night[key]).multiplyScalar(wn);
  out.add(_c2);
  return out;
}

function paletteColor(pal, key, wd, wk, wn) {
  const out = new THREE.Color(0, 0, 0);
  mix3(pal.day, pal.dusk, pal.night, key, out, wd, wk, wn);
  return out;
}

const SKY_VERT = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAG = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform vec3 horizonGlow;
  uniform float uNight;
  uniform float uStars;
  varying vec3 vWorldPosition;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = clamp(dir.y, -0.25, 1.0);
    vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));
    col = mix(bottomColor, col, smoothstep(-0.22, 0.02, h));

    float sunAmt = max(dot(dir, normalize(sunDir)), 0.0);
    col += sunColor * pow(sunAmt, 420.0) * 3.2;
    col += sunColor * pow(sunAmt, 12.0) * 0.1;
    col += horizonGlow * pow(max(0.0, 1.0 - abs(h)), 12.0) * 0.18;

    if (dir.y > 0.02 && uStars > 0.01) {
      vec2 sp = dir.xz / max(dir.y, 0.12);
      vec2 cell = floor(sp * 210.0);
      vec2 f = fract(sp * 210.0) - 0.5;
      float star = step(0.9988, hash21(cell));
      float tw = 0.55 + 0.45 * hash21(cell + 7.1);
      col += vec3(star * tw) * uStars * smoothstep(0.02, 0.35, dir.y) * 0.85;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const WATER_VERT = `
  varying vec3 vWorld;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAG = `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uCityGlow;
  uniform float uNight;
  uniform float uSparkle;
  uniform float uReflect;  varying vec3 vWorld;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  float wave(vec2 p, float t) {
    return sin(p.x * 0.055 + t * 0.7) * 0.5
         + sin(p.y * 0.071 - t * 0.52) * 0.32
         + sin((p.x + p.y) * 0.024 + t * 0.31) * 0.35
         + sin((p.x - p.y) * 0.11 - t * 0.8) * 0.12;
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec2 p = vWorld.xz;
    float wave = sin(p.x * 0.018 + uTime * 0.35) * 0.5
               + sin(p.y * 0.024 - uTime * 0.28) * 0.5;
    float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
    vec3 col = mix(uDeep, uShallow, 0.42 + 0.12 * wave);
    col = mix(col, uSky, clamp(fres * uReflect, 0.0, 1.0));
    vec3 n = normalize(vec3(
      sin(p.x * 0.02 + uTime * 0.3) * 0.03,
      1.0,
      sin(p.y * 0.025 - uTime * 0.22) * 0.03
    ));
    vec3 refl = reflect(-viewDir, n);
    float glint = pow(max(dot(refl, normalize(uSunDir)), 0.0), 200.0);
    col += uSunColor * glint * 1.2;
    col += uCityGlow * uNight * 0.05 * smoothstep(0.1, 0.4, fres);
    col += uCityGlow * uNight * 0.035;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

export class Environment {
  constructor(scene) {
    this.scene = scene;

    this.skyUniforms = {
      topColor: { value: new THREE.Color('#3d76b5') },
      horizonColor: { value: new THREE.Color('#d6e4ef') },
      bottomColor: { value: new THREE.Color('#9fb4c5') },
      sunColor: { value: new THREE.Color('#fff1d0') },
      sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4) },
      horizonGlow: { value: new THREE.Color('#ffb47a') },
      uNight: { value: 0 },
      uStars: { value: 0 },
    };

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2200, 40, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2e26, 1.0);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.0);
    this.sun.position.set(180, 260, 140);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x7f9fd8, 0.35);
    this.fill.position.set(-220, 120, -180);
    scene.add(this.fill);

    this.uplight = new THREE.DirectionalLight(0xff9bd2, 0.0);
    this.uplight.position.set(0, -100, 0);
    scene.add(this.uplight);

    this.waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#0b1c26') },
        uShallow: { value: new THREE.Color('#1d3a44') },
        uSky: { value: new THREE.Color('#9fc0d8') },
        uSunColor: { value: new THREE.Color('#ffd9a0') },
        uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.2) },
        uCityGlow: { value: new THREE.Color('#ff9a5a') },
        uNight: { value: 0 },
        uSparkle: { value: 1 },
        uReflect: { value: 0.38 },
      },
    ]);

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(3600, 3600, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.waterUniforms,
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        fog: true,
      })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.water.visible = false;
    this.water.frustumCulled = false;
    scene.add(this.water);

    this.scene.fog = new THREE.FogExp2(0xb9c9d6, 0.0018);
    this.windowNight = 0;
    this.time = 0;
    this.sunDir = new THREE.Vector3(0.5, 0.7, 0.4);
    this._palettes = new Map();
  }

  convertPalette(style) {
    if (this._palettes.has(style.id)) return this._palettes.get(style.id);
    const converted = {};
    for (const phase of ['day', 'dusk', 'night']) {
      const src = style.env[phase];
      const dst = { ...src };
      for (const [key, value] of Object.entries(src)) {
        if (typeof value === 'string') dst[key] = new THREE.Color(value);
      }
      converted[phase] = dst;
    }
    this._palettes.set(style.id, converted);
    return converted;
  }

  setWaterVisible(visible) {
    this.water.visible = visible;
  }

  apply(style, params) {
    const t = clamp(params.time, 0, 1);
    this.time = t;
    const dayW = 1 - smoothstep(0.3, 0.56, t);
    const nightW = smoothstep(0.56, 0.87, t);
    const duskW = Math.max(0, 1 - dayW - nightW);
    const pal = this.convertPalette(style);

    const top = paletteColor(pal, 'skyTop', dayW, duskW, nightW);
    const horizon = paletteColor(pal, 'skyHorizon', dayW, duskW, nightW);
    const bottom = paletteColor(pal, 'skyBottom', dayW, duskW, nightW);
    const sunColor = paletteColor(pal, 'sunColor', dayW, duskW, nightW);
    const fogColor = paletteColor(pal, 'fogColor', dayW, duskW, nightW);
    const hemiSky = paletteColor(pal, 'hemiSky', dayW, duskW, nightW);
    const hemiGround = paletteColor(pal, 'hemiGround', dayW, duskW, nightW);
    const glow = paletteColor(pal, 'horizonGlow', dayW, duskW, nightW);
    const waterDeep = paletteColor(pal, 'waterDeep', dayW, duskW, nightW);
    const waterShallow = paletteColor(pal, 'waterShallow', dayW, duskW, nightW);

    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.horizonColor.value.copy(horizon);
    this.skyUniforms.bottomColor.value.copy(bottom);
    this.skyUniforms.sunColor.value.copy(sunColor);
    this.skyUniforms.horizonGlow.value.copy(glow);
    this.skyUniforms.uNight.value = nightW;
    this.skyUniforms.uStars.value = smoothstep(0.62, 0.9, t);

    // Sun / moon arc.
    const az = -1.15 + t * 2.0;
    const elev = Math.cos(t * Math.PI);
    const r = Math.sqrt(Math.max(0, 1 - elev * elev));
    this.sunDir.set(Math.cos(az) * r, elev, Math.sin(az) * r).normalize();
    this.skyUniforms.sunDir.value.copy(this.sunDir);

    const sunIntensity = (pal.day.sunIntensity * dayW + pal.dusk.sunIntensity * duskW + pal.night.sunIntensity * nightW);
    const hemiIntensity = (pal.day.hemiIntensity * dayW + pal.dusk.hemiIntensity * duskW + pal.night.hemiIntensity * nightW);
    this.sun.color.copy(sunColor);
    this.sun.intensity = sunIntensity;
    this.sun.position.copy(this.sunDir).multiplyScalar(600);
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(hemiGround);
    this.hemi.intensity = hemiIntensity;
    this.fill.intensity = 0.12 + dayW * 0.5;
    this.fill.color.copy(hemiSky);
    this.uplight.intensity = nightW * (style.env.nightCityGlow ?? 0.25);
    this.uplight.color.set(style.env.nightGlowColor ?? '#ff8f6a');

    // At night the sun is below the horizon; use a soft moon/fill direction.
    if (this.sunDir.y < 0.06) {
      this.sun.position.set(-this.sunDir.x * 600, 260, -this.sunDir.z * 600);
      this.sun.intensity = Math.max(sunIntensity, 0.4 * nightW + 0.08);
    } else {
      this.sun.intensity = sunIntensity;
    }

    this.scene.fog.color.copy(fogColor);
    const density = (0.00022 + params.fog * 0.0019) * (style.fogScale ?? 1);
    this.scene.fog.density = density;

    this.waterUniforms.uDeep.value.copy(waterDeep);
    this.waterUniforms.uShallow.value.copy(waterShallow);
    this.waterUniforms.uSky.value.copy(horizon).lerp(top, 0.4);
    this.waterUniforms.uSunColor.value.copy(sunColor);
    this.waterUniforms.uSunDir.value.copy(this.sunDir);
    this.waterUniforms.uNight.value = nightW;
    this.waterUniforms.uReflect.value = style.waterReflect ?? 0.38;
    this.waterUniforms.uCityGlow.value.copy(paletteColor(pal, 'horizonGlow', dayW, duskW, nightW));

    this.windowNight = smoothstep(0.46, 0.68, t);
    this.nightW = nightW;
    this.dayW = dayW;
    this.duskW = duskW;
    this.fogColor = fogColor;
    this.sunColor = sunColor;
    return { dayW, duskW, nightW };
  }

  setNightFor(materials, night) {
    for (const m of materials) {
      if (m.userData && m.userData.uniforms && m.userData.uniforms.uNight) {
        m.userData.uniforms.uNight.value = night;
      }
    }
  }

  tick(elapsed) {
    this.waterUniforms.uTime.value = elapsed;
  }
}
