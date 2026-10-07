import * as THREE from 'three';
import type { PbrSet } from './assets';
import { noise2D } from './noiseTextures';

/**
 * Environment surface material: photoscanned PBR sets (albedo / normal / AO-rough-metal) with
 *  - stochastic anti-tiling (no visible texture repeats down long corridors),
 *  - large-scale tonal variation, grime toward the ground and contact shadows at wall bases,
 *  - a moss / snow / ash layer that settles on upward faces, crevices and wall feet,
 *  - optional wet patches (dark, glossy) on floors,
 *  - a smooth blend into a second biome's materials driven by a per-cell biome field.
 */

export interface SurfaceLayer {
  set: PbrSet;
  /** Multiplies the albedo (keeps scanned detail but lets each biome grade it). */
  tint: number;
  /** Texture repeats per world UV unit. */
  scale: number;
  normalScale?: number;
  roughness?: number;
  /** Settling layer (moss, snow, ash). */
  moss?: { color: number; amount: number };
  /** Glossy wet patches (floors). */
  wet?: number;
}

/** Per-cell scalar fields shared by every surface of a maze (biome blend, wall layout). */
export interface MazeFields {
  /** R = biome B weight (0..1), sampled with linear filtering across cells. */
  biome: THREE.DataTexture;
  /** RGBA = closed wall flags N, E, S, W for contact shadows (nearest filtering). */
  walls: THREE.DataTexture;
  /** World size of the maze (x, z) in metres. */
  size: THREE.Vector2;
  cellSize: number;
  wallHalf: number;
}

export interface EnvMaterialOptions {
  a: SurfaceLayer;
  b?: SurfaceLayer;
  fields: MazeFields;
  kind: 'wall' | 'floor' | 'ceiling' | 'trim';
  /** 0..1 darkening toward the floor. */
  grime?: number;
  envIntensity?: number;
}

const GLSL_COMMON = /* glsl */ `
  uniform sampler2D uBiomeMap;
  uniform sampler2D uWallMap;
  uniform vec2 uMazeSize;
  uniform float uCell;
  uniform float uWallHalf;
  uniform float uScaleA;
  uniform float uScaleB;
  uniform vec3 uTintA;
  uniform vec3 uTintB;
  uniform vec2 uNormalScaleAB;
  uniform vec2 uRoughAB;
  uniform vec3 uMossA;
  uniform vec3 uMossB;
  uniform vec2 uMossAmtAB;
  uniform vec2 uWetAB;
  uniform float uGrime;
  uniform float uKind;
  #ifdef ENV_BIOME_B
    uniform sampler2D uMapB;
    uniform sampler2D uNorB;
    uniform sampler2D uArmB;
  #endif
  varying vec3 vWPos;
  varying vec3 vWNormal;

  uniform sampler2D uNoise2;
  // Precomputed tileable noise (see noiseTextures.ts): value noise and fBm, 1 cycle per unit.
  // LOD 0 lookups are safe inside non-uniform branches; use the mipmapped ones elsewhere.
  float eNoise(vec2 p) { return texture2D(uNoise2, p * 0.03125).g; }
  float eFbm(vec2 p) { return texture2D(uNoise2, p * 0.125).r; }
  float eNoiseLod(vec2 p) { return textureLod(uNoise2, p * 0.03125, 0.0).g; }
  // Triplanar-ish 2D domain for world noise on any face.
  vec2 eDomain(vec3 p, vec3 n) {
    vec3 an = abs(n);
    return an.y > 0.6 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  }

  struct ETexel { vec4 col; vec3 nor; vec3 arm; };

  // Stochastic tiling (after Inigo Quilez, "texture repetition", technique 3): two offset lookups
  // per pixel, picked by a low-frequency noise and blended on the albedo's own contrast.
  ETexel eSample(sampler2D mapT, sampler2D norT, sampler2D armT, vec2 uv) {
    vec2 dx = dFdx(uv); vec2 dy = dFdy(uv);
    float k = eNoiseLod(uv * 0.21);
    float l = k * 8.0;
    float f = fract(l);
    float ia = floor(l);
    float ib = ia + 1.0;
    vec2 offa = sin(vec2(3.0, 7.0) * ia);
    vec2 offb = sin(vec2(3.0, 7.0) * ib);
    vec4 ca = textureGrad(mapT, uv + offa, dx, dy);
    vec4 cb = textureGrad(mapT, uv + offb, dx, dy);
    float w = smoothstep(0.2, 0.8, f - 0.1 * dot(ca.rgb - cb.rgb, vec3(1.0)));
    ETexel t;
    t.col = mix(ca, cb, w);
    t.nor = mix(textureGrad(norT, uv + offa, dx, dy).xyz, textureGrad(norT, uv + offb, dx, dy).xyz, w);
    t.arm = mix(textureGrad(armT, uv + offa, dx, dy).xyz, textureGrad(armT, uv + offb, dx, dy).xyz, w);
    return t;
  }

  // Contact shadow from the closed walls of the cell this point is in (cheap stand-in for AO).
  float eContact(vec3 p, float reach) {
    vec2 cell = floor(p.xz / uCell);
    vec2 cells = uMazeSize / uCell;
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= cells.x || cell.y >= cells.y) return 1.0;
    vec4 w = texture2D(uWallMap, (cell + 0.5) / cells);
    vec2 l = p.xz - cell * uCell;
    float o = 1.0;
    float h = uWallHalf;
    o *= mix(1.0, smoothstep(h, h + reach, l.y), step(0.5, w.r));
    o *= mix(1.0, smoothstep(h, h + reach, uCell - l.x), step(0.5, w.g));
    o *= mix(1.0, smoothstep(h, h + reach, uCell - l.y), step(0.5, w.b));
    o *= mix(1.0, smoothstep(h, h + reach, l.x), step(0.5, w.a));
    // Corner posts.
    vec2 c = min(l, vec2(uCell) - l);
    o *= smoothstep(h * 1.3, h * 1.3 + reach, length(c));
    return o;
  }
`;

/** Builds the per-cell field textures for a maze. */
export function createMazeFields(
  width: number,
  height: number,
  cellSize: number,
  wallHalf: number,
  biomeWeight: (cell: number) => number,
  closed: (cell: number, dir: 0 | 1 | 2 | 3) => boolean,
): MazeFields {
  const n = width * height;
  const b = new Uint8Array(n * 4);
  const w = new Uint8Array(n * 4);
  for (let c = 0; c < n; c++) {
    const v = Math.round(Math.min(1, Math.max(0, biomeWeight(c))) * 255);
    b[c * 4] = v;
    b[c * 4 + 3] = 255;
    for (let d = 0; d < 4; d++) w[c * 4 + d] = closed(c, d as 0 | 1 | 2 | 3) ? 255 : 0;
  }
  const biome = new THREE.DataTexture(b, width, height, THREE.RGBAFormat);
  biome.magFilter = THREE.LinearFilter;
  biome.minFilter = THREE.LinearFilter;
  biome.wrapS = biome.wrapT = THREE.ClampToEdgeWrapping;
  biome.needsUpdate = true;
  const walls = new THREE.DataTexture(w, width, height, THREE.RGBAFormat);
  walls.magFilter = THREE.NearestFilter;
  walls.minFilter = THREE.NearestFilter;
  walls.needsUpdate = true;
  return { biome, walls, size: new THREE.Vector2(width * cellSize, height * cellSize), cellSize, wallHalf };
}

export function createEnvMaterial(o: EnvMaterialOptions): THREE.MeshStandardMaterial {
  const { a, b, fields } = o;
  const mat = new THREE.MeshStandardMaterial({
    map: a.set.map,
    normalMap: a.set.normalMap,
    roughnessMap: a.set.arm,
    aoMap: a.set.arm,
    aoMapIntensity: 1,
    roughness: 1,
    metalness: 0,
    envMapIntensity: o.envIntensity ?? 0.6,
  });
  const kindId = { wall: 0, floor: 1, ceiling: 2, trim: 3 }[o.kind];
  const uniforms = {
    uBiomeMap: { value: fields.biome },
    uWallMap: { value: fields.walls },
    uMazeSize: { value: fields.size },
    uCell: { value: fields.cellSize },
    uWallHalf: { value: fields.wallHalf },
    uScaleA: { value: a.scale },
    uScaleB: { value: b?.scale ?? a.scale },
    uTintA: { value: new THREE.Color(a.tint) },
    uTintB: { value: new THREE.Color(b?.tint ?? a.tint) },
    uNormalScaleAB: { value: new THREE.Vector2(a.normalScale ?? 1, b?.normalScale ?? 1) },
    uRoughAB: { value: new THREE.Vector2(a.roughness ?? 1, b?.roughness ?? 1) },
    uMossA: { value: new THREE.Color(a.moss?.color ?? 0x3f5a22) },
    uMossB: { value: new THREE.Color(b?.moss?.color ?? 0x3f5a22) },
    uMossAmtAB: { value: new THREE.Vector2(a.moss?.amount ?? 0, b?.moss?.amount ?? 0) },
    uWetAB: { value: new THREE.Vector2(a.wet ?? 0, b?.wet ?? 0) },
    uGrime: { value: o.grime ?? 0.35 },
    uKind: { value: kindId },
    uMapB: { value: b?.set.map ?? null },
    uNorB: { value: b?.set.normalMap ?? null },
    uArmB: { value: b?.set.arm ?? null },
    uNoise2: { value: noise2D() },
  };
  // Textures bound through custom uniforms, so loaders can pre-upload them.
  mat.userData.textures = [uniforms.uMapB.value, uniforms.uNorB.value, uniforms.uArmB.value, uniforms.uNoise2.value, fields.biome, fields.walls].filter(Boolean);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (b) shader.defines = { ...(shader.defines ?? {}), ENV_BIOME_B: '' };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec3 wn = normalize(vWNormal);
        vec2 dom = eDomain(vWPos, wn);
        // All noise is sampled up front (mipmapped lookups need uniform control flow).
        float nJag = eFbm(vWPos.xz * 0.45 + vWPos.y * 0.3);
        float nMacro = eFbm(dom * 0.13 + 3.7);
        float nHue = eNoise(dom * 0.07 + 11.0);
        float nFoot = eNoise(dom * 1.7);
        float nMoss1 = eFbm(dom * 0.9 + 5.0);
        float nMoss2 = eNoise(dom * 5.3);
        float nPud = eFbm(vWPos.xz * 0.22 + 41.0);
        float bw = 0.0;
        #ifdef ENV_BIOME_B
          bw = texture2D(uBiomeMap, vWPos.xz / uMazeSize).r;
          // Ragged, organic border between the biomes.
          float jag = (nJag - 0.5) * 1.6;
          bw = clamp(bw + jag * bw * (1.0 - bw) * 2.0, 0.0, 1.0);
          bw = smoothstep(0.1, 0.9, bw);
        #endif
        ETexel tx;
        float eRough;
        vec3 mossCol;
        float mossAmt;
        float wetAmt;
        vec2 uvBase = vMapUv;
        if (bw < 0.999) {
          tx = eSample(map, normalMap, roughnessMap, uvBase * uScaleA);
          tx.col.rgb *= uTintA;
          tx.nor.xy = (tx.nor.xy * 2.0 - 1.0) * uNormalScaleAB.x * 0.5 + 0.5;
          eRough = uRoughAB.x;
        }
        #ifdef ENV_BIOME_B
          if (bw > 0.001) {
            ETexel tb = eSample(uMapB, uNorB, uArmB, uvBase * uScaleB);
            tb.col.rgb *= uTintB;
            tb.nor.xy = (tb.nor.xy * 2.0 - 1.0) * uNormalScaleAB.y * 0.5 + 0.5;
            if (bw >= 0.999) { tx = tb; eRough = uRoughAB.y; }
            else {
              // Height-aware blend: B creeps into A's crevices first.
              float hA = tx.arm.r; float hB = tb.arm.r;
              float t = smoothstep(0.0, 1.0, clamp((bw - 0.5) * 2.0 + (hB - hA) * 0.6 + 0.5, 0.0, 1.0));
              tx.col = mix(tx.col, tb.col, t);
              tx.nor = mix(tx.nor, tb.nor, t);
              tx.arm = mix(tx.arm, tb.arm, t);
              eRough = mix(uRoughAB.x, uRoughAB.y, t);
            }
          }
        #endif
        mossCol = mix(uMossA, uMossB, bw);
        mossAmt = mix(uMossAmtAB.x, uMossAmtAB.y, bw);
        wetAmt = mix(uWetAB.x, uWetAB.y, bw);

        vec3 albedo = tx.col.rgb;
        // Large-scale tonal variation (stains, sun-bleaching, soot).
        float macro = nMacro;
        albedo *= mix(0.72, 1.18, macro);
        float hue = nHue;
        albedo *= mix(vec3(1.04, 0.98, 0.92), vec3(0.94, 1.0, 1.05), hue);
        float ao = tx.arm.r;
        float rough = clamp(tx.arm.g * eRough, 0.04, 1.0);
        vec3 nTex = tx.nor;

        // Grime and damp toward the ground on vertical faces.
        if (uKind == 0.0 || uKind == 3.0) {
          float foot = 1.0 - smoothstep(0.0, 1.6, vWPos.y + (nFoot - 0.5) * 0.6);
          albedo *= 1.0 - uGrime * foot * 0.75;
          // Ground contact on wall feet and arch piers.
          albedo *= mix(0.55, 1.0, smoothstep(0.0, 0.35, vWPos.y));
        }
        // Contact shadows where floors meet walls.
        if (uKind == 1.0) {
          float c = eContact(vWPos, 0.75);
          albedo *= mix(0.42, 1.0, c);
          ao *= mix(0.5, 1.0, c);
        }
        if (uKind == 2.0) {
          albedo *= mix(0.5, 1.0, eContact(vWPos, 0.9));
        }

        // Settling layer: moss on tops and in crevices, creeping up from the ground.
        if (mossAmt > 0.0) {
          float up = wn.y;
          float n1 = nMoss1;
          float n2 = nMoss2;
          float crevice = 1.0 - smoothstep(0.25, 0.75, ao);
          float mask;
          if (uKind == 1.0) {
            // Floors: in the joints and along wall feet.
            mask = crevice * 0.9 + (1.0 - eContact(vWPos, 1.2)) * 0.8;
          } else {
            float tops = smoothstep(0.45, 0.9, up);
            float feet = 1.0 - smoothstep(0.0, 1.3 + n1 * 1.4, vWPos.y);
            mask = tops * 1.2 + feet * 0.8 + crevice * 0.35;
          }
          mask *= smoothstep(0.25, 0.75, n1 + mossAmt - 0.5);
          mask = clamp(mask * mossAmt * 1.6 + (n2 - 0.5) * 0.25 * mask, 0.0, 1.0);
          vec3 mc = mossCol * mix(0.65, 1.25, n2) * mix(0.8, 1.1, ao);
          albedo = mix(albedo, mc, mask);
          rough = mix(rough, 0.95, mask);
          nTex = mix(nTex, vec3(0.5, 0.5, 1.0), mask * 0.55);
        }

        // Wet patches: darker, glossy, flattened (puddles collect in low spots).
        if (uKind == 1.0 && wetAmt > 0.0) {
          float pud = smoothstep(0.58, 0.72, eFbm(vWPos.xz * 0.22 + 41.0) + (1.0 - ao) * 0.15);
          pud *= wetAmt;
          albedo *= mix(1.0, 0.45, pud);
          rough = mix(rough, 0.06, pud);
          nTex = mix(nTex, vec3(0.5, 0.5, 1.0), pud * 0.85);
        }

        diffuseColor.rgb *= albedo;
        float envAO = ao;
        float envRough = rough;
        vec3 envNor = nTex;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = envRough;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 mapN = envNor * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
        `,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `
        float ambientOcclusion = (envAO - 1.0) * aoMapIntensity + 1.0;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNVao = saturate(dot(geometryNormal, geometryViewDir));
          reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNVao, ambientOcclusion, material.roughness);
        #endif
        `,
      );
  };
  mat.customProgramCacheKey = () => `env2-${b ? 'ab' : 'a'}`;
  return mat;
}
