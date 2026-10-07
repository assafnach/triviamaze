import * as THREE from 'three';
import type { ThemeDef } from '../environments/themes';
import { moonTexture, skyTexture } from './textures';

export interface Sky {
  group: THREE.Group;
  update(time: number, cameraPos: THREE.Vector3): void;
  /** Direction toward the moon (for the directional light). */
  moonDir: THREE.Vector3;
}

function horizonTexture(theme: ThemeDef): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const col = new THREE.Color(theme.skyBottom).multiplyScalar(0.55);
  ctx.fillStyle = `#${col.getHexString()}`;
  let seed = 17;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.beginPath();
  ctx.moveTo(0, 256);
  if (theme.id === 'forest') {
    // Tree line.
    for (let x = 0; x <= 2048; x += 18) {
      const h = 90 + rand() * 90;
      ctx.lineTo(x, 256 - h * 0.6);
      ctx.lineTo(x + 9, 256 - h);
      ctx.lineTo(x + 18, 256 - h * 0.6);
    }
  } else if (theme.id === 'castle' || theme.id === 'ruins') {
    // Rolling hills with distant towers.
    for (let x = 0; x <= 2048; x += 8) {
      const h = 50 + Math.sin(x * 0.004) * 25 + Math.sin(x * 0.011 + 2) * 12;
      ctx.lineTo(x, 256 - h);
      if (rand() < 0.012) {
        const tw = 14 + rand() * 16;
        const th = 60 + rand() * 80;
        ctx.lineTo(x, 256 - h - th);
        for (let k = 0; k < 3; k++) {
          ctx.lineTo(x + (k * tw) / 3, 256 - h - th - 8);
          ctx.lineTo(x + ((k + 0.5) * tw) / 3, 256 - h - th - 8);
          ctx.lineTo(x + ((k + 0.5) * tw) / 3, 256 - h - th);
        }
        ctx.lineTo(x + tw, 256 - h - th);
        ctx.lineTo(x + tw, 256 - h);
      }
    }
  } else {
    // Jagged mountains.
    for (let x = 0; x <= 2048; x += 32) {
      ctx.lineTo(x, 256 - (60 + rand() * 120));
    }
  }
  ctx.lineTo(2048, 256);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const auroraVertex = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y += sin(uv.x * 9.0 + uTime * 0.4) * 2.5;
    p.x += sin(uv.x * 5.0 + uTime * 0.25) * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const auroraFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float band = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
    float wave = 0.55 + 0.45 * sin(vUv.x * 40.0 + uTime * 0.8 + sin(vUv.x * 7.0 + uTime) * 2.0);
    vec3 col = mix(vec3(0.1, 0.9, 0.6), vec3(0.4, 0.3, 1.0), vUv.y);
    gl_FragColor = vec4(col, band * wave * 0.32);
  }
`;

export function createSky(theme: ThemeDef, center: THREE.Vector3): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const moonDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
  if (!theme.openSky) {
    return { group, moonDir, update: () => undefined };
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(110, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(theme.skyTop, theme.skyBottom, theme.stars), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -10;
  group.add(dome);

  const horizon = new THREE.Mesh(
    new THREE.CylinderGeometry(100, 100, 26, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: horizonTexture(theme), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  horizon.position.y = 6;
  horizon.renderOrder = -9;
  group.add(horizon);

  let aurora: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  if (theme.aurora) {
    aurora = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 26, 64, 1),
      new THREE.ShaderMaterial({
        vertexShader: auroraVertex,
        fragmentShader: auroraFragment,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    aurora.position.set(0, 48, -70);
    aurora.rotation.x = 0.35;
    aurora.renderOrder = -8;
    group.add(aurora);
  }

  if (theme.moon) {
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false, depthWrite: false, transparent: true }));
    moon.scale.setScalar(22);
    moon.position.copy(moonDir).multiplyScalar(95);
    moon.renderOrder = -8;
    group.add(moon);
  }
  group.position.copy(center);
  return {
    group,
    moonDir,
    update(time, cameraPos) {
      group.position.set(cameraPos.x, 0, cameraPos.z);
      if (aurora) aurora.material.uniforms.uTime!.value = time;
    },
  };
}
