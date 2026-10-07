import * as THREE from 'three';
import { glowTexture } from '../render/textures';
import type { Doorway } from '../render/MazeWorld';

const vertex = /* glsl */ `
  attribute float aOffset;
  attribute float aSize;
  uniform float uTime;
  uniform float uScale;
  uniform float uReveal;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.65 + 0.35 * sin(uTime * 8.0 + aOffset * 40.0);
    gl_PointSize = aSize * tw * uScale / -mv.z;
    vAlpha = uReveal * tw;
  }
`;
const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor * t.rgb, t.a * vAlpha);
  }
`;

/**
 * The creature's revealed route: a stream of magical particles flowing from the creature,
 * through the correct archway and down the corridor; the arch outline lights up and a rune
 * circle glows on the floor. Purely visual — the player still walks there themselves.
 */
export class RouteHint {
  readonly group = new THREE.Group();
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly offsets: Float32Array;
  private readonly positions: Float32Array;
  private reveal = 0;
  private active = true;
  private age = 0;

  constructor(
    from: THREE.Vector3,
    private readonly doorway: Doorway,
    color: number,
    private readonly light: THREE.PointLight,
    particleScale: number,
  ) {
    const door = doorway.center.clone().setY(1.6);
    const beyond = doorway.center.clone().addScaledVector(doorway.outward, 3.2).setY(0.7);
    const farther = doorway.center.clone().addScaledVector(doorway.outward, 5.5).setY(0.45);
    const approach = from.clone().lerp(door, 0.45);
    approach.y = Math.max(from.y, 1.9);
    this.curve = new THREE.CatmullRomCurve3([from.clone(), approach, door, beyond, farther]);
    const count = Math.max(40, Math.round(140 * particleScale));
    this.offsets = new Float32Array(count);
    this.positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.offsets[i] = i / count + Math.random() * 0.02;
      sizes[i] = 0.06 + Math.random() * 0.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(this.offsets, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 600 },
        uReveal: { value: 0 },
        uMap: { value: glowTexture() },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    doorway.glow.visible = true;
    doorway.runes.visible = true;
    light.color.setHex(color);
    light.position.copy(doorway.center).addScaledVector(doorway.outward, 0.6).setY(2.2);
  }

  get finished(): boolean {
    return !this.active && this.reveal <= 0.001;
  }

  get seconds(): number {
    return this.age;
  }

  /** Begin fading out (player walked through, moved away, or time is up). */
  dismiss(): void {
    this.active = false;
  }

  update(dt: number, time: number, viewportHeight: number): void {
    this.age += dt;
    this.reveal = this.active ? Math.min(1, this.reveal + dt * 1.2) : Math.max(0, this.reveal - dt * 0.8);
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uReveal!.value = this.reveal;
    this.material.uniforms.uScale!.value = viewportHeight * 0.9;
    // Particles flow along the curve, revealed progressively from the creature outward.
    const flow = time * 0.22;
    const tmp = new THREE.Vector3();
    const head = Math.min(1, this.age * 0.8);
    for (let i = 0; i < this.offsets.length; i++) {
      const u = ((this.offsets[i] as number) + flow) % 1;
      const visible = u <= head;
      this.curve.getPointAt(visible ? u : 0, tmp);
      const j = i * 3;
      const wob = Math.sin(time * 4 + i) * 0.06;
      this.positions[j] = tmp.x + wob;
      this.positions[j + 1] = tmp.y + Math.cos(time * 3 + i * 1.3) * 0.06;
      this.positions[j + 2] = tmp.z - wob;
      if (!visible) this.positions[j + 1] = -50;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.doorway.glow.material.opacity = this.reveal * (0.65 + 0.35 * pulse);
    this.doorway.runes.material.opacity = this.reveal * 0.85 * pulse;
    this.doorway.runes.rotation.y = time * 0.25;
    this.light.intensity = this.reveal * 9 * pulse;
    if (this.finished) {
      this.doorway.glow.visible = false;
      this.doorway.runes.visible = false;
      this.light.intensity = 0;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
    this.doorway.glow.visible = false;
    this.doorway.runes.visible = false;
    this.light.intensity = 0;
  }
}
