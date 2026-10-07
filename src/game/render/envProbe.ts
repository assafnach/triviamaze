import * as THREE from 'three';
import type { ThemeDef } from '../environments/themes';

/**
 * A pre-filtered environment probe for PBR reflections: the biome's sky (or cave) gradient with a
 * few soft light cards standing in for the moon and distant fires. Without it, glossy stone, wet
 * floors, water and creature eyes would reflect nothing but black.
 */
export function createEnvProbe(renderer: THREE.WebGLRenderer, theme: ThemeDef): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const top = new THREE.Color(theme.skyTop);
  const horizon = new THREE.Color(theme.skyBottom);
  const ground = new THREE.Color(theme.hemiGround);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: top }, uHorizon: { value: horizon }, uGround: { value: ground } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uGround, pow(-y, 0.5));
          gl_FragColor = vec4(c * 1.6, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);
  const card = (color: number, intensity: number, dir: THREE.Vector3, size: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(dir.normalize().multiplyScalar(8));
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  if (theme.openSky) card(theme.moonLight, 3 * theme.moonIntensity + 0.5, new THREE.Vector3(-0.4, 0.8, -0.5), 2.2);
  // Warm bounce from torches and braziers all around.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    card(theme.light.color, 0.9, new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)), 1.6);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return rt;
}
