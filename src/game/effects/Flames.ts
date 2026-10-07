import * as THREE from 'three';
import { flameTexture, glowTexture } from '../render/textures';

export interface FlameSpec {
  position: THREE.Vector3;
  size: number;
  color: THREE.Color;
}

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uHalo;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float flick = 1.0 + 0.16 * sin(uTime * 13.0 + aSeed * 6.0) + 0.09 * sin(uTime * 23.0 + aSeed * 11.0);
    if (uHalo < 0.5) p.x += sin(uTime * 7.0 + aSeed * 3.0) * 0.012;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * flick * uScale / -mvPosition.z;
    #include <fog_vertex>
    vColor = aColor;
    vAlpha = mix(1.0, 0.35 + 0.08 * sin(uTime * 9.0 + aSeed), uHalo);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb * 1.6, t.a * vAlpha);
    #include <fog_fragment>
  }
`;

/** All flames in the labyrinth drawn in two draw calls (flames + halos). */
export class Flames {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor(specs: FlameSpec[]) {
    if (specs.length === 0) return;
    const positions = new Float32Array(specs.length * 3);
    const sizes = new Float32Array(specs.length);
    const halo = new Float32Array(specs.length);
    const seeds = new Float32Array(specs.length);
    const colors = new Float32Array(specs.length * 3);
    specs.forEach((s, i) => {
      positions.set([s.position.x, s.position.y, s.position.z], i * 3);
      sizes[i] = s.size;
      halo[i] = s.size * 4.5;
      seeds[i] = Math.random() * 10;
      colors.set([s.color.r, s.color.g, s.color.b], i * 3);
    });
    const make = (sizeArr: Float32Array, map: THREE.Texture, isHalo: boolean): THREE.Points => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uTime: { value: 0 },
          uScale: { value: 300 },
          uHalo: { value: isHalo ? 1 : 0 },
          uMap: { value: map },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      });
      this.materials.push(mat);
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      return pts;
    };
    this.group.add(make(halo, glowTexture(), true));
    this.group.add(make(sizes, flameTexture(), false));
  }

  update(time: number, viewportHeight: number): void {
    for (const m of this.materials) {
      m.uniforms.uTime!.value = time;
      m.uniforms.uScale!.value = viewportHeight * 0.55;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Points) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
