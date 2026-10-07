import * as THREE from 'three';

/**
 * Still water (pools, lakes) and molten lava surfaces. Both are standard PBR materials whose
 * normals (and, for lava, emission) are animated in the shader, so they pick up the scene's
 * lights and environment reflections like every other surface.
 */

const RIPPLE_GLSL = /* glsl */ `
  uniform float uTime;
  varying vec3 vLWPos;
  float lHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float lNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lHash(i), lHash(i + vec2(1.0, 0.0)), u.x), mix(lHash(i + vec2(0.0, 1.0)), lHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float lHeight(vec2 p, float t) {
    float h = 0.0;
    h += lNoise(p * 1.3 + vec2(t * 0.25, t * 0.18)) * 0.5;
    h += lNoise(p * 2.9 - vec2(t * 0.31, -t * 0.22)) * 0.3;
    h += lNoise(p * 6.1 + vec2(-t * 0.5, t * 0.41)) * 0.2;
    return h;
  }
`;

function inject(mat: THREE.MeshStandardMaterial, fragmentTail: string, strength: number, uniforms: Record<string, THREE.IUniform>): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIPPLE_GLSL}`)
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        {
          vec2 p = vLWPos.xz;
          float e = 0.06;
          float h0 = lHeight(p, uTime);
          float hx = lHeight(p + vec2(e, 0.0), uTime);
          float hz = lHeight(p + vec2(0.0, e), uTime);
          vec3 wn = normalize(vec3(-(hx - h0) / e * ${strength.toFixed(3)}, 1.0, -(hz - h0) / e * ${strength.toFixed(3)}));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        ${fragmentTail}
        `,
      );
  };
}

export interface LiquidMaterial {
  material: THREE.MeshStandardMaterial;
  update(time: number): void;
}

export function waterMaterial(color = 0x0c1a22, glow = 0x000000): LiquidMaterial {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.04,
    metalness: 0.05,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.9,
    emissive: glow,
  });
  // Bioluminescent shimmer in the depths (only when a glow colour is given).
  inject(
    material,
    glow === 0
      ? ''
      : /* glsl */ `
      float shimmer = lHeight(vLWPos.xz * 0.8, uTime * 0.6);
      gWaterGlow = 0.25 + smoothstep(0.45, 0.8, shimmer) * 0.9;
      `,
    0.09,
    uniforms,
  );
  if (glow !== 0) {
    const base = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      base.call(material, shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nfloat gWaterGlow = 0.0;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= gWaterGlow;');
    };
  }
  material.customProgramCacheKey = () => (glow === 0 ? 'water' : 'water-glow');
  return {
    material,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}

export function lavaMaterial(): LiquidMaterial {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: 0x1a0a06, roughness: 0.85, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 });
  inject(material, '', 0.35, uniforms);
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
      {
        vec2 p = vLWPos.xz;
        float flow = lHeight(p * 0.7 + vec2(uTime * 0.05, 0.0), uTime * 0.3);
        float crust = smoothstep(0.42, 0.62, lHeight(p * 1.6, uTime * 0.12));
        float heat = (1.0 - crust) * (0.6 + 0.8 * flow);
        totalEmissiveRadiance = vec3(3.2, 0.9, 0.12) * heat + vec3(1.2, 0.25, 0.04) * pow(heat, 3.0);
        diffuseColor.rgb = mix(vec3(0.05, 0.03, 0.025), diffuseColor.rgb, heat);
      }
      `,
    );
  };
  material.customProgramCacheKey = () => 'lava';
  return {
    material,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}

/** A falling sheet of water: scrolling streaks, additive, fades at the edges. */
export function waterfallMaterial(): LiquidMaterial {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
      void main() {
        vec2 p = vec2(vUv.x * 9.0, vUv.y * 2.5 + uTime * 1.6);
        float streak = n(vec2(p.x, p.y * 0.35)) * 0.6 + n(p * vec2(2.0, 0.6)) * 0.4;
        streak = smoothstep(0.35, 0.95, streak);
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float foam = smoothstep(0.25, 0.0, vUv.y);
        float a = (streak * 0.42 + foam * 0.35 + 0.05) * edge;
        gl_FragColor = vec4(vec3(0.6, 0.78, 0.9) * a, a);
      }
    `,
  });
  return {
    material: material as unknown as THREE.MeshStandardMaterial,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
