import * as THREE from 'three';
import type { ThemeDef } from '../environments/themes';
import { surfaceTextures } from './textures';

export interface ThemeMaterials {
  wall: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  crystal: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createThemeMaterials(theme: ThemeDef, textureSize: number): ThemeMaterials {
  const size = Math.min(textureSize, 1024);
  const wallTex = surfaceTextures(theme.wall.pattern, theme.wall, size, theme.wall.pattern === 'hedge' ? 3.2 : 2.4, 11);
  const floorTex = surfaceTextures(theme.floor.pattern, theme.floor, size, 2.2, 23);
  const ceilColors = theme.ceiling ?? { base: theme.wall.base, accent: theme.wall.accent };
  const ceilTex = theme.openSky
    ? floorTex
    : surfaceTextures('rock', { ...ceilColors, mortar: theme.wall.mortar }, Math.min(size, 512), 2, 31);

  const wall = new THREE.MeshStandardMaterial({
    map: wallTex.map,
    normalMap: wallTex.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: theme.wall.roughness,
    metalness: 0,
  });
  const trim = new THREE.MeshStandardMaterial({
    map: wallTex.map,
    normalMap: wallTex.normalMap,
    color: new THREE.Color(theme.trim).lerp(new THREE.Color(0xffffff), 0.35),
    roughness: Math.min(1, theme.wall.roughness + 0.02),
    metalness: theme.id === 'temple' ? 0.15 : 0,
  });
  const floor = new THREE.MeshStandardMaterial({
    map: floorTex.map,
    normalMap: floorTex.normalMap,
    roughness: theme.floor.roughness,
    metalness: 0,
  });
  const ceiling = new THREE.MeshStandardMaterial({
    map: ceilTex.map,
    normalMap: ceilTex.normalMap,
    roughness: 0.95,
    side: THREE.FrontSide,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.45, metalness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.9, emissive: 0x2a1a00 });
  const glow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.light.color).multiplyScalar(0.6),
    emissive: theme.light.color,
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  // Faceted, glossy crystal that glows from within and catches reflections on its faces.
  const crystal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.runeColor).lerp(new THREE.Color(0xffffff), 0.15).multiplyScalar(0.8),
    emissive: theme.id === 'volcanic' ? 0xff4a10 : theme.light.kind === 'crystal' ? theme.light.color : theme.runeColor,
    emissiveIntensity: 0.2,
    roughness: 0.1,
    metalness: 0.2,
    envMapIntensity: 1.4,
    flatShading: true,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.wall.base).multiplyScalar(0.85),
    roughness: 0.9,
    map: wallTex.map,
  });

  const all = [wall, trim, floor, ceiling, wood, metal, gold, glow, crystal, stone];
  return {
    wall,
    trim,
    floor,
    ceiling,
    wood,
    metal,
    gold,
    glow,
    crystal,
    stone,
    dispose() {
      for (const m of all) m.dispose();
    },
  };
}
