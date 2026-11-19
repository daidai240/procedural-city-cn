import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Facade material
// A MeshStandardMaterial with a procedural window grid driven by per-instance
// data. One draw call per building family, yet every facade reads as individual
// lit windows. `uNight` is animated with the time-of-day slider.
// ---------------------------------------------------------------------------
export function createFacadeMaterial(opts = {}) {
  const uniforms = {
    uNight: { value: 0 },
    uLit: { value: opts.lit ?? 0.45 },
    uWinA: { value: new THREE.Color(opts.winA ?? '#ffd9a0') },
    uWinB: { value: new THREE.Color(opts.winB ?? '#9fd8ff') },
    uFloorH: { value: opts.floorH ?? 3.4 },
    uColW: { value: opts.colW ?? 2.6 },
    uGlow: { value: opts.glow ?? 1.5 },
    uRimColor: { value: new THREE.Color(opts.rimColor ?? '#8fb8e8') },
    uRim: { value: opts.rim ?? 0.0 },
    uBaseDark: { value: opts.baseDark ?? 0.55 },
  };

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.74,
    metalness: opts.metalness ?? 0.08,
    emissive: 0x000000,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aBldg;
        varying vec4 vBldg;
        varying vec3 vBSize;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBldg = aBldg;
        #ifdef USE_INSTANCING
          vec3 iScale = vec3(
            length(instanceMatrix[0].xyz),
            length(instanceMatrix[1].xyz),
            length(instanceMatrix[2].xyz)
          );
        #else
          vec3 iScale = vec3(1.0);
        #endif
        vBSize = position * iScale;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        uniform float uLit;
        uniform vec3 uWinA;
        uniform vec3 uWinB;
        uniform float uFloorH;
        uniform float uColW;
        uniform float uGlow;
        uniform vec3 uRimColor;
        uniform float uRim;
        uniform float uBaseDark;
        varying vec4 vBldg;
        varying vec3 vBSize;

        float bHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sideMask = smoothstep(0.55, 0.9, 1.0 - abs(normalize(normal).y));
        float faceU = abs(normalize(normal).x) > abs(normalize(normal).z) ? vBSize.z : vBSize.x;
        float faceY = vBSize.y;
        float colW = uColW * (0.86 + 0.28 * vBldg.y);
        float cellU = floor(faceU / colW);
        float cellV = floor(faceY / uFloorH);
        vec2 cell = vec2(cellU, cellV);
        float fu = fract(faceU / colW);
        float fv = fract(faceY / uFloorH);
        float winMask = step(0.24, fu) * step(fu, 0.76) * step(0.26, fv) * step(fv, 0.7);
        float aboveGround = step(2.4, faceY);
        float h1 = bHash(cell + vec2(vBldg.x * 37.0, vBldg.x * 11.0));
        float lit = step(1.0 - uLit * (0.35 + 0.9 * vBldg.y), h1);
        vec3 winCol = mix(uWinA, uWinB, step(0.72, bHash(cell * 1.31 + vBldg.x)));
        totalEmissiveRadiance += winCol * winMask * lit * aboveGround * sideMask * uNight * uGlow;
        // Ground-floor shopfront glow.
        float shop = (1.0 - step(4.2, faceY)) * step(0.8, faceY) * sideMask * uNight;
        totalEmissiveRadiance += uWinA * shop * 0.55;
        // A faint self-glow keeps the metropolis legible after dark.
        totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.075;
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uRimColor * fres * uRim * (0.35 + 0.65 * uNight);
        diffuseColor.rgb *= mix(uBaseDark, 1.0, smoothstep(0.0, 10.0, faceY));
        diffuseColor.rgb *= 0.9 + 0.1 * step(0.12, fv);`
      );
  };

  mat.userData.uniforms = uniforms;
  mat.userData.disposeOnClear = true;
  return mat;
}

export function glowMaterial(color, opacity = 0.9, scale = 1.6) {
  const c = new THREE.Color(color).multiplyScalar(scale);
  return new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });
}

export function basicGlow(color, opacity = 1, scale = 2.0) {
  const c = new THREE.Color(color).multiplyScalar(scale);
  return new THREE.MeshBasicMaterial({
    color: c,
    transparent: opacity < 1,
    opacity,
    toneMapped: true,
  });
}

// Street lamps / traffic points share a soft additive point material.
export function pointGlowMaterial(size = 1.6, opacity = 0.95) {
  return new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Simple glass for landmark towers.
export function glassMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.16,
    metalness: opts.metalness ?? 0.55,
    transparent: true,
    opacity: opts.opacity ?? 0.92,
    emissive: new THREE.Color(opts.emissive ?? '#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    envMapIntensity: 1,
    side: THREE.DoubleSide,
  });
}

// Animated LED billboard shader (Shenzhen). Renders scrolling glyph blocks.
export function createLedScreenMaterial(colorA = '#ff2bd6', colorB = '#00e5ff') {
  const uniforms = {
    uTime: { value: 0 },
    uA: { value: new THREE.Color(colorA) },
    uB: { value: new THREE.Color(colorB) },
    uNight: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uNight;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(233.34, 851.73));
        p += dot(p, p + 23.45);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 uv = vUv;
        vec2 grid = vec2(16.0, 22.0);
        vec2 cell = floor(uv * grid);
        vec2 f = fract(uv * grid);
        float block = step(0.16, f.x) * step(f.x, 0.84) * step(0.14, f.y) * step(f.y, 0.86);
        float scroll = fract(cell.y / grid.y * 2.0 + uTime * 0.16);
        float glyph = hash(cell + floor(uTime * 0.7));
        float on = step(0.52, glyph) * step(0.3, scroll);
        vec3 col = mix(uA, uB, hash(cell * 1.7));
        // horizontal scan band
        float scan = smoothstep(0.0, 0.1, abs(fract(uv.y * 0.6 - uTime * 0.12) - 0.5) - 0.38);
        col *= 0.55 + 0.45 * scan;
        float glow = block * on;
        gl_FragColor = vec4(col * glow * (1.4 + uNight * 1.8), 1.0);
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  mat.userData.disposeOnClear = true;
  return mat;
}
