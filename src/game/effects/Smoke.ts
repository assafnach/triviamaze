import * as THREE from 'three';
import { glowTexture } from '../render/textures';

const vertex = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  varying float vRot;
  void main() {
    // Each puff loops through its own life: rising, drifting with a lazy breeze, spreading out.
    float life = 4.5 + aSeed.x * 2.5;
    float age = fract(uTime / life + aSeed.y);
    vec3 p = position;
    p.y += age * (1.6 + aSeed.z) * aSize;
    p.x += sin(uTime * 0.4 + aSeed.x * 6.0) * age * 0.5 + age * age * 0.6;
    p.z += cos(uTime * 0.3 + aSeed.y * 6.0) * age * 0.4;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.35 + age * 1.6) * aSize * uScale / -mv.z;
    vAlpha = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.45, 1.0, age));
    vRot = aSeed.z * 6.28 + uTime * (aSeed.x - 0.5) * 0.6;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vRot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vRot);
    float k = cos(vRot);
    vec2 r = vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5;
    float a = texture2D(uMap, r).a;
    // Break the round sprite into a billowy shape.
    a *= 0.75 + 0.25 * sin(r.x * 9.0 + vRot) * sin(r.y * 7.0 - vRot);
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
  }
`;

/**
 * Smoke rising from fires, braziers and camp pits. Fully animated on the GPU (each puff loops
 * through its life from its seed), one draw call for every column in the labyrinth.
 */
export class Smoke {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(sources: { position: THREE.Vector3; size: number }[], scale: number, color = 0x3a3634) {
    const per = Math.max(4, Math.round(14 * scale));
    const n = sources.length * per;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    const size = new Float32Array(n);
    sources.forEach((src, si) => {
      for (let i = 0; i < per; i++) {
        const j = si * per + i;
        pos[j * 3] = src.position.x + (Math.random() - 0.5) * 0.15 * src.size;
        pos[j * 3 + 1] = src.position.y + src.size * 0.3;
        pos[j * 3 + 2] = src.position.z + (Math.random() - 0.5) * 0.15 * src.size;
        seed[j * 3] = Math.random();
        seed[j * 3 + 1] = i / per;
        seed[j * 3 + 2] = Math.random();
        size[j] = Math.min(1.4, 0.5 + src.size * 0.6);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 600 },
        uMap: { value: glowTexture() },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0.45 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  update(time: number, viewportHeight: number): void {
    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uScale!.value = viewportHeight * 0.9;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
