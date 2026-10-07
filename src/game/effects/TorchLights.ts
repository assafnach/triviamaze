import * as THREE from 'three';

export interface LightSpot {
  position: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  flicker: number;
}

interface Slot {
  light: THREE.PointLight;
  spot: LightSpot | null;
  level: number;
}

/**
 * The labyrinth may contain dozens of torches, but only a handful of real lights.
 * This pool assigns the nearest/most visible torches to a few point lights and
 * cross-fades them so reassignment is never visible as a pop.
 */
export class TorchLights {
  readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private timer = 0;
  private desired = new Set<LightSpot>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly spots: LightSpot[],
    maxLights: number,
  ) {
    for (let i = 0; i < maxLights; i++) {
      // Lights stay `visible` permanently: changing the light count recompiles every shader.
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      this.group.add(light);
      this.slots.push({ light, spot: null, level: 0 });
    }
  }

  update(dt: number, time: number, camPos: THREE.Vector3, camDir: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      const scored = this.spots
        .map((s) => {
          this.tmp.subVectors(s.position, camPos);
          const d = this.tmp.length();
          const facing = d > 0.001 ? this.tmp.dot(camDir) / d : 1;
          return { s, score: d - facing * 4 };
        })
        .filter((x) => x.score < 26)
        .sort((a, b) => a.score - b.score)
        .slice(0, this.slots.length);
      this.desired = new Set(scored.map((x) => x.s));
    }
    const assigned = new Set(this.slots.map((s) => s.spot));
    for (const slot of this.slots) {
      if (slot.spot && this.desired.has(slot.spot)) {
        slot.level = Math.min(1, slot.level + dt * 2.5);
      } else {
        slot.level = Math.max(0, slot.level - dt * 3);
        if (slot.level === 0) {
          const next = [...this.desired].find((s) => !assigned.has(s));
          if (slot.spot) assigned.delete(slot.spot);
          slot.spot = next ?? null;
          if (next) {
            assigned.add(next);
            slot.light.position.copy(next.position);
            slot.light.color.setHex(next.color);
            slot.light.distance = next.distance;
          }
        }
      }
      const s = slot.spot;
      if (!s) slot.light.intensity = 0;
      else {
        const phase = s.position.x * 3.1 + s.position.z * 1.7;
        const flick = 1 - s.flicker * (0.5 + 0.5 * Math.sin(time * 9 + phase) * Math.sin(time * 5.3 + phase * 2));
        slot.light.intensity = s.intensity * slot.level * flick;
      }
    }
  }

  dispose(): void {
    for (const s of this.slots) s.light.dispose();
  }
}
