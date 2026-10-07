import * as THREE from 'three';
import { TREASURE_NAMES } from '@/content/he/ui';
import { glowTexture } from '../render/textures';

interface TreasureItem {
  cell: number;
  kind: number;
  group: THREE.Group;
  base: THREE.Vector3;
  collecting: number;
  hidden: boolean;
}

/** Optional collectibles: small bonuses, never required. */
export class Treasures {
  readonly group = new THREE.Group();
  private readonly items: TreasureItem[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(cells: number[], centerOf: (cell: number) => THREE.Vector3, seed: number) {
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe2a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
    this.disposables.push(glowMat);
    const mats = {
      crystal: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4ac0ff, emissiveIntensity: 1.8, roughness: 0.1, metalness: 0.2 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0x8a5a00, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.95 }),
      rune: new THREE.MeshStandardMaterial({ color: 0x8a8a9a, emissive: 0xb08aff, emissiveIntensity: 1.2, roughness: 0.6 }),
      feather: new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff6a20, emissiveIntensity: 1.4, side: THREE.DoubleSide }),
      paper: new THREE.MeshStandardMaterial({ color: 0xf2e2c0, emissive: 0x6a5020, emissiveIntensity: 0.4, roughness: 0.8 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe0e8f0, emissive: 0x506080, emissiveIntensity: 0.5, roughness: 0.2, metalness: 1 }),
    };
    this.disposables.push(...Object.values(mats));
    const geos = {
      oct: new THREE.OctahedronGeometry(0.16, 0),
      coin: new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20),
      slab: new THREE.BoxGeometry(0.22, 0.28, 0.05),
      feather: new THREE.ConeGeometry(0.06, 0.4, 4),
      scroll: new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10),
      ring: new THREE.TorusGeometry(0.12, 0.03, 8, 20),
      gem: new THREE.SphereGeometry(0.06, 10, 8),
    };
    this.disposables.push(...Object.values(geos));
    cells.forEach((cell, i) => {
      const kind = (i + seed) % TREASURE_NAMES.length;
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): void => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(...pos);
        m.rotation.set(...rot);
        g.add(m);
      };
      switch (kind) {
        case 0:
          add(geos.oct, mats.crystal, [0, 0, 0], [0, 0, 0]);
          add(geos.oct, mats.crystal, [0.1, -0.08, 0.04], [0.4, 0, 0.5]);
          break;
        case 1:
          add(geos.coin, mats.gold, [0, 0, 0], [Math.PI / 2, 0, 0]);
          add(geos.coin, mats.gold, [0.06, -0.1, 0.05], [Math.PI / 2.5, 0, 0.4]);
          break;
        case 2:
          add(geos.slab, mats.rune);
          break;
        case 3:
          add(geos.feather, mats.feather, [0, 0, 0], [0, 0, 0.5]);
          break;
        case 4:
          add(geos.scroll, mats.paper, [0, 0, 0], [0, 0, Math.PI / 2]);
          break;
        default:
          add(geos.ring, mats.silver);
          add(geos.gem, mats.crystal, [0, -0.15, 0]);
      }
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(0.9);
      g.add(glow);
      const base = centerOf(cell).clone();
      // Offset a little from the cell centre so it reads as "found", not placed.
      base.x += Math.sin(cell * 1.7) * 0.6;
      base.z += Math.cos(cell * 2.3) * 0.6;
      base.y = 0.95;
      g.position.copy(base);
      this.group.add(g);
      this.items.push({ cell, kind, group: g, base, collecting: 0, hidden: false });
    });
  }

  nameOf(cell: number): string {
    const it = this.items.find((i) => i.cell === cell);
    return TREASURE_NAMES[it?.kind ?? 0] as string;
  }

  /** Returns the cell of a treasure within reach, if any. */
  nearby(x: number, z: number, reach: number): number | null {
    for (const it of this.items) {
      if (it.hidden || it.collecting > 0) continue;
      if (Math.hypot(it.base.x - x, it.base.z - z) < reach) return it.cell;
    }
    return null;
  }

  collect(cell: number): void {
    const it = this.items.find((i) => i.cell === cell);
    if (it) it.collecting = 0.001;
  }

  /** Sync visibility with the session (collected treasures hidden, lost ones restored). */
  sync(isCollected: (cell: number) => boolean): void {
    for (const it of this.items) {
      const collected = isCollected(it.cell);
      it.hidden = collected;
      it.collecting = 0;
      it.group.visible = !collected;
      it.group.scale.setScalar(1);
    }
  }

  update(dt: number, time: number): void {
    for (const it of this.items) {
      if (it.hidden) continue;
      if (it.collecting > 0) {
        it.collecting += dt * 2.5;
        it.group.position.y = it.base.y + it.collecting * 0.8;
        it.group.scale.setScalar(1 + it.collecting * 0.6);
        if (it.collecting >= 1) {
          it.hidden = true;
          it.group.visible = false;
        }
        continue;
      }
      it.group.position.y = it.base.y + Math.sin(time * 1.8 + it.cell) * 0.08;
      it.group.rotation.y = time * 1.2 + it.cell;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
