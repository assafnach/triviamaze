import * as THREE from 'three';
import type { ParticleKind } from '../environments/themes';
import { glowTexture } from '../render/textures';

interface KindParams {
  color: number;
  size: number;
  velocity: [number, number, number];
  wobble: number;
  blink: number;
  count: number;
  opacity: number;
  /** Solid things (leaves) are alpha-blended and tumble; lights (fireflies, embers) add up. */
  solid?: boolean;
  spin?: number;
}

const KINDS: Record<ParticleKind, KindParams> = {
  dust: { color: 0xffe6c0, size: 0.05, velocity: [0.03, 0.01, 0.02], wobble: 0.15, blink: 0, count: 350, opacity: 0.35 },
  fireflies: { color: 0xd8ff7a, size: 0.09, velocity: [0, 0.02, 0], wobble: 0.6, blink: 1, count: 160, opacity: 0.9 },
  embers: { color: 0xff7a2a, size: 0.07, velocity: [0.05, 0.45, 0.02], wobble: 0.25, blink: 0.4, count: 260, opacity: 0.9 },
  snow: { color: 0xffffff, size: 0.06, velocity: [0.15, -0.6, 0.05], wobble: 0.3, blink: 0, count: 600, opacity: 0.8 },
  spores: { color: 0xc89bff, size: 0.07, velocity: [0.02, 0.06, 0.01], wobble: 0.4, blink: 0.6, count: 260, opacity: 0.7 },
  motes: { color: 0x9fd4ff, size: 0.06, velocity: [0.01, 0.04, 0.01], wobble: 0.35, blink: 0.7, count: 280, opacity: 0.75 },
  leaves: { color: 0xb07a32, size: 0.14, velocity: [0.18, -0.32, 0.06], wobble: 0.9, blink: 0, count: 110, opacity: 0.95, solid: true, spin: 1 },
};

let leafTex: THREE.Texture | null = null;
/** A single leaf with a midrib, drawn once (tinted per particle in the shader). */
function leafTexture(): THREE.Texture {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.translate(32, 32);
  ctx.rotate(0.6);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.quadraticCurveTo(18, -8, 0, 28);
  ctx.quadraticCurveTo(-18, -8, 0, -28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,80,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(0, 30);
  ctx.stroke();
  leafTex = new THREE.CanvasTexture(c);
  return leafTex;
}

const vertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform vec3 uVel;
  uniform float uWobble;
  uniform float uBlink;
  uniform float uSize;
  uniform float uScale;
  uniform float uSpin;
  varying float vAlpha;
  varying float vRot;
  varying float vTint;
  void main() {
    vec3 p = position + uVel * uTime;
    p.x += sin(uTime * 0.7 + aSeed.x * 6.28) * uWobble;
    p.y += sin(uTime * 0.9 + aSeed.y * 6.28) * uWobble * 0.6;
    p.z += cos(uTime * 0.6 + aSeed.z * 6.28) * uWobble;
    // Wrap the particle field around the camera so it is always populated.
    vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uCam + rel;
    world.y = clamp(world.y, 0.05, 6.0);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uScale / -mv.z;
    float edge = 1.0 - smoothstep(0.35, 0.5, length(rel.xz / uBox.xz));
    float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.x * 2.0) + aSeed.y * 20.0), uBlink);
    vAlpha = edge * blink;
    vRot = aSeed.z * 6.28 + uTime * uSpin * (aSeed.x - 0.5) * 4.0;
    vTint = 0.65 + aSeed.y * 0.6;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSpin;
  varying float vAlpha;
  varying float vRot;
  varying float vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vRot);
    float k = cos(vRot);
    vec2 uv = uSpin > 0.0 ? vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5 : gl_PointCoord;
    vec4 t = texture2D(uMap, uv);
    vec3 col = uSpin > 0.0 ? uColor * vTint * t.rgb : uColor * t.rgb;
    if (uSpin > 0.0 && t.a < 0.4) discard;
    gl_FragColor = vec4(col, t.a * vAlpha * uOpacity);
  }
`;

/** A camera-following field of atmospheric particles, animated entirely on the GPU. */
export class AmbientParticles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly baseOpacity: number;

  constructor(kind: ParticleKind, scale: number, colorOverride?: number) {
    const k = KINDS[kind];
    const count = Math.max(20, Math.round(k.count * scale));
    const box = new THREE.Vector3(26, 6, 26);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * box.x;
      pos[i * 3 + 1] = Math.random() * box.y;
      pos[i * 3 + 2] = Math.random() * box.z;
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uVel: { value: new THREE.Vector3(...k.velocity) },
        uWobble: { value: k.wobble },
        uBlink: { value: k.blink },
        uSize: { value: k.size },
        uScale: { value: 600 },
        uMap: { value: k.solid ? leafTexture() : glowTexture() },
        uColor: { value: new THREE.Color(colorOverride ?? k.color) },
        uOpacity: { value: k.opacity },
        uSpin: { value: k.spin ?? 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: k.solid ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.baseOpacity = k.opacity;
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(time: number, cam: THREE.Vector3, viewportHeight: number): void {
    this.material.uniforms.uTime!.value = time;
    (this.material.uniforms.uCam!.value as THREE.Vector3).copy(cam);
    this.material.uniforms.uScale!.value = viewportHeight * 0.9;
  }

  /** Fades the whole field (biome crossovers). */
  setStrength(k: number): void {
    this.material.uniforms.uOpacity!.value = this.baseOpacity * k;
    this.points.visible = k > 0.01;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
