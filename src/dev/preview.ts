import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { tickDetailMaterial } from '@/game/render/detailShader';
import type { SkinnedRig } from '@/game/creatures/rig';

/**
 * Development-only turntable for judging creature sculpts in isolation.
 * Usage: /?preview=goblin&view=front|close|side|back&mood=idle|happy|sad|point|walk
 */
export async function startPreview(name: string): Promise<void> {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') ?? 'front';
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#1a1a20';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24242c);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
  key.position.set(2, 3, 3);
  key.castShadow = true;
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.6);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim, new THREE.HemisphereLight(0x8090a0, 0x302820, 0.4));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { buildSpecies } = await import('@/game/creatures/species');
  const t0 = performance.now();
  const ctx = { quality: 'high' as const, voxelScale: 1 };
  const rig: SkinnedRig = name === 'bust' ? await (await import('./bust')).buildBust(ctx) : await buildSpecies(name, ctx);
  const buildMs = performance.now() - t0;
  scene.add(rig.root);
  const h = rig.height;
  // Perched and hovering creatures sit higher: frame them where they actually are.
  const lift = rig.perch || rig.flying ? rig.hoverHeight : 0;
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 50);
  const target = new THREE.Vector3(0, h * 0.55, 0);
  if (view === 'face') {
    // Frame the head bone from slightly off-axis.
    rig.root.updateMatrixWorld(true);
    const hp = (rig.bones.get('head') ?? rig.root).getWorldPosition(new THREE.Vector3());
    hp.y += lift;
    target.copy(hp).add(new THREE.Vector3(0, h * 0.03, 0.05));
    camera.position.copy(target).add(new THREE.Vector3(h * 0.12, h * 0.02, Math.max(0.55, h * 0.36)));
  } else if (view === 'close') {
    camera.position.set(h * 0.25, h * 0.88, h * 0.75);
    target.set(0, h * 0.85, 0);
  } else if (view === 'side') camera.position.set(h * 2.0, h * 0.7, 0.01);
  else if (view === 'back') camera.position.set(-h * 0.8, h * 0.8, -h * 1.9);
  else camera.position.set(h * 0.9, h * 0.75, h * 1.9);
  if (lift && view !== 'face') {
    target.y += lift;
    camera.position.y += lift;
  }
  camera.lookAt(target);

  const { Creature } = await import('@/game/creatures/Creature');
  const creature = new Creature(rig, new THREE.Vector3(0, 0, 0), 0);
  const mood = params.get('mood');
  if (mood === 'point') {
    creature.pointTarget = new THREE.Vector3(2, 0, 1);
    creature.setMood('point');
  } else if (mood) creature.setMood(mood as 'idle');
  if (view !== 'back' && view !== 'side') creature.lookTarget = camera.position.clone();
  const tris = rig.mesh.geometry.index ? rig.mesh.geometry.index.count / 3 : 0;
  const tf = performance.now();
  renderer.render(scene, camera);
  renderer.getContext().finish();
  const firstFrameMs = Math.round(performance.now() - tf);
  (window as unknown as { __preview: unknown }).__preview = { buildMs: Math.round(buildMs), firstFrameMs, tris, ready: true };
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    creature.update(dt, t, false);
    for (const m of rig.detailMats) tickDetailMaterial(m, t);
    renderer.render(scene, camera);
  });
}
