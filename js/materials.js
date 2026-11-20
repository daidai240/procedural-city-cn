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
    uDetail: { value: opts.detail ?? 1.0 },
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
        uniform float uDetail;
        varying vec4 vBldg;
        varying vec3 vBSize;

        float bHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        // Anti-aliased band between a and b; aa is the half pixel footprint.
        float facadeRect(float x, float a, float b, float aa) {
          return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x));
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 nrm = normalize(normal);
        float sideMask = smoothstep(0.55, 0.9, 1.0 - abs(nrm.y));
        float faceU = abs(nrm.x) > abs(nrm.z) ? vBSize.z : vBSize.x;
        float faceY = vBSize.y;
        float faceTop = vBSize.y;
        float colW = uColW * (0.86 + 0.28 * vBldg.y);
        float u = faceU / colW;
        float v = faceY / uFloorH;
        vec2 cell = floor(vec2(u, v));
        float fu = fract(u);
        float fv = fract(v);
        float aaU = max(fwidth(u) * 1.35, 0.0025);
        float aaV = max(fwidth(v) * 1.35, 0.0025);
        float winMask = facadeRect(fu, 0.24, 0.76, aaU) * facadeRect(fv, 0.26, 0.70, aaV);
        float aboveGround = step(2.4, faceY);
        float h1 = bHash(cell + vec2(vBldg.x * 37.0, vBldg.x * 11.0));
        float lit = step(1.0 - uLit * (0.35 + 0.9 * vBldg.y), h1);
        vec3 winCol = mix(uWinA, uWinB, step(0.72, bHash(cell * 1.31 + vBldg.x)));

        // Near / far detail split. Sub-pixel facade relief fades with distance so
        // far buildings read as smooth silhouettes instead of shimmering grids.
        float viewDist = length(vViewPosition);
        float far = smoothstep(150.0, 520.0, viewDist);
        float detail = (1.0 - far) * uDetail;

        // Close-up relief: window frames, mullions, floor slabs and a cornice.
        float frame = max(0.0, facadeRect(fu, 0.15, 0.85, aaU) * facadeRect(fv, 0.17, 0.79, aaV) - winMask) * aboveGround * sideMask;
        float mullion = facadeRect(fu, 0.48, 0.52, aaU * 1.6) * facadeRect(fv, 0.26, 0.70, aaV) * aboveGround * sideMask;
        float slab = facadeRect(fv, 0.0, 0.075, aaV) * sideMask;
        float slabHi = facadeRect(fv, 0.075, 0.135, aaV) * sideMask;
        float cornice = smoothstep(faceTop - 2.2, faceTop - 1.0, faceY) * sideMask;

        // Daylight glazing: windows read as dark glass, frames catch the light.
        float dayGlass = (1.0 - uNight * 0.55) * detail;
        vec3 glassCol = mix(diffuseColor.rgb * 0.28, uWinB * 0.72, 0.42);
        diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, winMask * sideMask * aboveGround * dayGlass * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + vec3(0.025), frame * detail * (0.24 + 0.50 * (1.0 - uNight)));
        diffuseColor.rgb *= 1.0 - mullion * detail * 0.45;
        diffuseColor.rgb *= 1.0 - slab * detail * 0.30;
        diffuseColor.rgb *= 1.0 + slabHi * detail * 0.10;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + vec3(0.02), cornice * detail * (0.25 + 0.35 * (1.0 - uNight)));

        // Night windows. Beyond the detail range the individual window grid is
        // averaged into a soft facade glow and a weaker emission; this keeps the
        // far skyline smooth while preserving the lit-city character.
        float winLit = winMask * lit * aboveGround * sideMask;
        float farSoft = far * far;
        totalEmissiveRadiance += winCol * winLit * uNight * uGlow * (1.0 - farSoft * 0.45);
        totalEmissiveRadiance += winCol * (uLit * 0.22) * aboveGround * sideMask * uNight * uGlow * farSoft;
        // Ground-floor shopfront glow.
        float shop = (1.0 - step(4.2, faceY)) * step(0.8, faceY) * sideMask * uNight;
        totalEmissiveRadiance += uWinA * shop * 0.55;
        // A faint self-glow keeps the metropolis legible after dark.
        totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.075;
        // Atmospheric rim on tall towers keeps distant landmark silhouettes
        // legible without changing the near-field look.
        float fres = pow(1.0 - abs(dot(nrm, normalize(vViewPosition))), 3.0);
        float landmark = smoothstep(80.0, 150.0, faceTop);
        totalEmissiveRadiance += uRimColor * fres * (uRim + landmark * 0.045 * smoothstep(180.0, 520.0, viewDist)) * (0.35 + 0.65 * uNight);
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
        // Low-frequency blocks: big cells, slow vertical drift. High-frequency
        // noise read as a broken screen at any distance.
        vec2 grid = vec2(6.0, 8.0);
        vec2 cell = floor(uv * grid);
        vec2 f = fract(uv * grid);
        float block = smoothstep(0.08, 0.18, f.x) * (1.0 - smoothstep(0.82, 0.92, f.x))
                    * smoothstep(0.1, 0.2, f.y) * (1.0 - smoothstep(0.8, 0.9, f.y));
        float band = 0.45 + 0.55 * smoothstep(-0.2, 0.4, sin(uv.y * 3.0 + uTime * 0.35));
        float glyph = smoothstep(0.3, 0.75, hash(cell + floor(uTime * 0.15)));
        float on = glyph * band;
        vec3 col = mix(uA, uB, smoothstep(0.2, 0.8, hash(cell * 1.37 + 0.5)));
        float glow = block * on;
        gl_FragColor = vec4(col * glow * (0.5 + uNight * 0.5), 1.0);
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  mat.userData.disposeOnClear = true;
  return mat;
}
