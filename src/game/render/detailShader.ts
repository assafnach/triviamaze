import * as THREE from 'three';
import { noise3D } from './noiseTextures';

/**
 * Shared GLSL noise, read from a precomputed tileable 3D texture (see `noiseTextures.ts`):
 * dF = fBm (1 cycle per unit at the base octave), dV = Voronoi (F1, F2 − F1, cell id; 1 cell per
 * unit). Texture lookups keep the shader small enough to compile quickly everywhere.
 */
const NOISE_GLSL = /* glsl */ `
  uniform sampler3D uNoise3;
  float dF(vec3 p) { return texture(uNoise3, p * 0.25).r; }
  vec3 dV(vec3 p) { vec4 t = texture(uNoise3, p * 0.125); return vec3(t.g * 1.2, t.b * 0.8, t.a); }
  float dHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
`;

const PERTURB_GLSL = /* glsl */ `
  vec3 dPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
    vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
    vec3 R1 = cross(vSigmaY, surf_norm);
    vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDir;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
`;

/**
 * Creature surface detail. Each mode returns a height (for bump), a cavity term (darkening in
 * grooves), a roughness multiplier and an emissive mask (lava cracks, runes).
 */
const CREATURE_DETAIL_GLSL = /* glsl */ `
  uniform float uDetailTime;
  uniform float uDetailScale;
  void creatureDetail(vec3 p, vec3 n, float mode, out float h, out float cavity, out float roughMul, out float glow) {
    h = 0.0; cavity = 0.0; roughMul = 1.0; glow = 0.0;
    vec3 q = p * uDetailScale;
    if (mode < 0.5) {            // skin: pores + soft wrinkles
      h = dF(q * 70.0) * 0.35 + dF(q * 14.0) * 0.65;
      cavity = smoothstep(0.55, 0.3, h) * 0.25;
    } else if (mode < 1.5) {     // bark: vertical grooves, plates
      float g = dF(vec3(q.x * 22.0, q.y * 3.0, q.z * 22.0) + dF(q * 4.0) * 1.5);
      h = g;
      cavity = smoothstep(0.42, 0.25, g) * 0.75;
      roughMul = 1.1;
    } else if (mode < 2.5) {     // stone: lumps and cracks
      vec3 v = dV(q * 9.0);
      float crack = 1.0 - smoothstep(0.0, 0.06, v.y);
      h = dF(q * 18.0) * 0.7 + v.x * 0.3 - crack * 0.6;
      cavity = crack * 0.7 + smoothstep(0.5, 0.25, dF(q * 6.0)) * 0.2;
    } else if (mode < 3.5) {     // cloth: weave + folds
      float weave = sin(q.x * 900.0 + q.z * 400.0) * sin(q.y * 900.0) * 0.08;
      h = dF(vec3(q.x * 9.0, q.y * 1.8, q.z * 9.0)) + weave;
      cavity = smoothstep(0.45, 0.25, h) * 0.35;
      roughMul = 1.05;
    } else if (mode < 4.5) {     // feathers: overlapping rounded scales
      vec3 v = dV(vec3(q.x * 26.0, q.y * 40.0, q.z * 26.0));
      h = smoothstep(0.0, 0.55, v.x) + dF(q * 300.0) * 0.08;
      cavity = (1.0 - smoothstep(0.0, 0.1, v.y)) * 0.4;
    } else if (mode < 5.5) {     // lava rock: dark crust with glowing fissures
      vec3 v = dV(q * 7.0);
      float crack = 1.0 - smoothstep(0.0, 0.07, v.y);
      h = dF(q * 14.0) * 0.6 - crack * 0.8;
      cavity = crack * 0.5;
      float pulse = 0.75 + 0.25 * sin(uDetailTime * 2.0 + v.z * 20.0);
      glow = crack * pulse;
    } else if (mode < 6.5) {     // crystal: clean facets
      vec3 v = dV(q * 5.0);
      h = v.x * 0.4;
      roughMul = 0.4;
    } else if (mode < 7.5) {     // reptile scales
      vec3 v = dV(q * 42.0);
      h = smoothstep(0.0, 0.5, v.x);
      cavity = (1.0 - smoothstep(0.0, 0.08, v.y)) * 0.55;
    } else if (mode < 8.5) {     // engraved stone with glowing runes
      vec3 v = dV(q * 9.0);
      float crack = 1.0 - smoothstep(0.0, 0.05, v.y);
      vec3 g = fract(q * vec3(5.0, 3.2, 5.0)) - 0.5;
      float cellId = dHash(floor(q * vec3(5.0, 3.2, 5.0)));
      float glyph = max(1.0 - smoothstep(0.02, 0.05, abs(g.y + (cellId - 0.75) * 0.6)), 1.0 - smoothstep(0.02, 0.05, abs(g.x + g.z)));
      glyph *= step(abs(g.y), 0.32) * step(abs(g.x + g.z * 0.3), 0.32) * step(0.55, cellId);
      h = dF(q * 16.0) * 0.6 - crack * 0.5 - glyph * 0.5;
      cavity = crack * 0.6 + glyph * 0.4;
      glow = glyph * (0.7 + 0.3 * sin(uDetailTime * 1.5 + cellId * 10.0));
    } else if (mode < 9.5) {     // horn / claw: growth rings
      h = sin(q.y * 160.0 + dF(q * 20.0) * 3.0) * 0.3 + dF(q * 40.0) * 0.5;
      roughMul = 0.7;
    } else if (mode < 10.5) {    // fur: directional strands
      h = dF(vec3(q.x * 120.0, q.y * 12.0, q.z * 120.0));
      cavity = smoothstep(0.5, 0.2, h) * 0.45;
      roughMul = 1.1;
    } else if (mode < 11.5) {    // moss: soft fuzzy clumps
      h = dF(q * 60.0);
      cavity = smoothstep(0.55, 0.3, h) * 0.5;
      roughMul = 1.15;
    } else if (mode < 12.5) {    // metal: scratches and pitting
      h = dF(vec3(q.x * 400.0, q.y * 8.0, q.z * 400.0)) * 0.3 + dF(q * 50.0) * 0.3;
      roughMul = 0.6 + dF(q * 12.0) * 0.6;
    } else {                     // ghostly: soft swirls
      h = dF(q * 6.0 + uDetailTime * 0.1);
    }
  }
`;

export interface CreatureMaterialOptions {
  transparent?: boolean;
  opacity?: number;
  physical?: boolean;
  /** Soft velvety rim for skin and fur (physical only). */
  sheen?: number;
  sheenColor?: number;
}

/**
 * Builds the creature material: vertex-coloured PBR with per-vertex roughness, emissive and
 * procedural micro-detail driven by the `aDetail` attribute written by the sculptor.
 */
export function createCreatureMaterial(opts: CreatureMaterialOptions = {}): THREE.MeshStandardMaterial {
  const Mat = opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  if (mat instanceof THREE.MeshPhysicalMaterial && opts.sheen) {
    mat.sheen = opts.sheen;
    mat.sheenRoughness = 0.55;
    mat.sheenColor = new THREE.Color(opts.sheenColor ?? 0xffd8b0);
  }
  const uniforms = { uDetailTime: { value: 0 }, uDetailScale: { value: 1 }, uNoise3: { value: noise3D() } };
  mat.userData.detailUniforms = uniforms;
  mat.userData.textures = [uniforms.uNoise3.value];
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aDetail;
        attribute float aRough;
        attribute vec3 aEmissive;
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        flat varying float vDetail;
        varying float vRough;
        varying vec3 vEmis;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObjPos = position;
        vObjNormal = normal;
        vDetail = aDetail;
        vRough = aRough;
        vEmis = aEmissive;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        flat varying float vDetail;
        varying float vRough;
        varying vec3 vEmis;
        ${NOISE_GLSL}
        ${PERTURB_GLSL}
        ${CREATURE_DETAIL_GLSL}
        float gDetailH; float gCavity; float gRoughMul; float gGlow;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        creatureDetail(vObjPos, vObjNormal, vDetail, gDetailH, gCavity, gRoughMul, gGlow);
        diffuseColor.rgb *= 1.0 - gCavity;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(vRough * gRoughMul, 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float bumpStrength = vDetail > 5.5 && vDetail < 6.5 ? 0.004 : 0.012;
          vec2 dHdxy = vec2(dFdx(gDetailH), dFdy(gDetailH)) * bumpStrength * 60.0;
          // Guard against derivative spikes at triangle edges where the detail family changes.
          float gLen = length(dHdxy);
          if (gLen > 0.35) dHdxy *= 0.35 / gLen;
          normal = dPerturb(-vViewPosition, normal, dHdxy, faceDirection);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vEmis;
        totalEmissiveRadiance += gGlow * (vDetail > 7.5 ? vec3(0.45, 0.85, 1.4) : vec3(2.2, 0.75, 0.15));`,
      );
  };
  mat.customProgramCacheKey = () => 'creature-detail-v2';
  return mat;
}

/** Advance animated detail (lava pulse, rune shimmer). */
export function tickDetailMaterial(mat: THREE.Material, time: number): void {
  const u = mat.userData.detailUniforms as { uDetailTime: { value: number } } | undefined;
  if (u) u.uDetailTime.value = time;
}
