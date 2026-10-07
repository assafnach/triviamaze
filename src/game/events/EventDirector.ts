import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/gameConfig';
import { AUDIO_CAPTIONS } from '@/content/he/ui';
import type { Rng } from '@/utils/rng';
import type { AudioEngine, Sfx } from '../audio/AudioEngine';
import type { ThemeDef } from '../environments/themes';
import { cellCenter, isOpen, neighbor, worldToCell } from '../maze/grid';
import { DIRS, type Maze } from '../maze/types';
import { dragonSilhouetteTexture, glowTexture } from '../render/textures';

type EventKind = 'dragon' | 'roar' | 'shadow' | 'swarm' | 'ghost' | 'whisper' | 'chime' | 'rumble';

interface ActiveEvent {
  update(dt: number, t: number): boolean;
  dispose(): void;
}

/**
 * Rare atmospheric moments that make the labyrinth feel alive. They never block the player
 * and never take control of the camera (a gentle rumble is skipped with reduced motion).
 */
export class EventDirector {
  readonly group = new THREE.Group();
  private timer: number;
  private active: ActiveEvent | null = null;
  private readonly kinds: EventKind[];
  shake = 0;

  constructor(
    private readonly maze: Maze,
    private readonly theme: ThemeDef,
    private readonly rng: Rng,
    private readonly audio: AudioEngine,
    private readonly caption: (text: string) => void,
    private readonly dimLights: (amount: number) => void,
  ) {
    this.timer = 35 + rng.range(0, 20);
    const k: EventKind[] = ['roar', 'swarm', 'ghost', 'whisper'];
    if (theme.openSky) k.push('dragon', 'dragon');
    else k.push('shadow', 'rumble');
    if (theme.light.kind === 'crystal' || theme.id === 'mystic' || theme.id === 'temple') k.push('chime');
    if (theme.id === 'volcanic') k.push('rumble');
    this.kinds = k;
  }

  /** @param quiet true while an encounter or cinematic is in progress */
  update(dt: number, t: number, camPos: THREE.Vector3, camDir: THREE.Vector3, quiet: boolean, reducedMotion: boolean): void {
    this.shake = Math.max(0, this.shake - dt * 0.8);
    if (this.active) {
      if (!this.active.update(dt, t)) {
        this.active.dispose();
        this.active = null;
      }
      return;
    }
    if (quiet) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const [min, max] = GAME_CONFIG.events.intervalSec;
    this.timer = this.rng.range(min, max);
    this.trigger(this.rng.pick(this.kinds), camPos, camDir, reducedMotion);
  }

  trigger(kind: EventKind, camPos: THREE.Vector3, camDir: THREE.Vector3, reducedMotion: boolean): void {
    const play = (s: Sfx): void => this.audio.play(s);
    switch (kind) {
      case 'dragon':
        this.active = this.dragon(camPos, camDir);
        play('wings');
        window.setTimeout(() => play('roar'), 1800);
        this.caption(AUDIO_CAPTIONS.wings);
        break;
      case 'roar':
        play('roar');
        if (!reducedMotion) this.shake = 0.5;
        this.caption(AUDIO_CAPTIONS.roar);
        break;
      case 'shadow':
        this.active = this.passingShadow();
        play('wings');
        this.caption(AUDIO_CAPTIONS.wings);
        break;
      case 'rumble':
        play('rumble');
        if (!reducedMotion) this.shake = 0.7;
        this.caption(AUDIO_CAPTIONS.rumble);
        break;
      case 'swarm':
        this.active = this.swarm(camPos, camDir);
        play('magic');
        break;
      case 'ghost': {
        const ev = this.ghost(camPos, camDir);
        if (ev) {
          this.active = ev;
          play('whisper');
          this.caption(AUDIO_CAPTIONS.whisper);
        }
        break;
      }
      case 'whisper':
        play('whisper');
        this.caption(AUDIO_CAPTIONS.whisper);
        break;
      case 'chime':
        play('chime');
        this.caption(AUDIO_CAPTIONS.chime);
        break;
    }
  }

  private dragon(camPos: THREE.Vector3, camDir: THREE.Vector3): ActiveEvent {
    const mat = new THREE.SpriteMaterial({ map: dragonSilhouetteTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.scale.set(22, 22, 1);
    const right = new THREE.Vector3(-camDir.z, 0, camDir.x).normalize();
    const ahead = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    const start = camPos.clone().addScaledVector(ahead, 45).addScaledVector(right, -70).setY(34);
    const end = camPos.clone().addScaledVector(ahead, 30).addScaledVector(right, 70).setY(40);
    // Travel is always screen-left → screen-right, matching the silhouette's facing.
    this.group.add(s);
    let t = 0;
    return {
      update: (dt) => {
        t += dt / 9;
        s.position.lerpVectors(start, end, t);
        s.position.y += Math.sin(t * Math.PI * 4) * 1.2;
        mat.opacity = Math.min(1, Math.min(t, 1 - t) * 6) * 0.9;
        return t < 1;
      },
      dispose: () => {
        mat.dispose();
        s.removeFromParent();
      },
    };
  }

  private passingShadow(): ActiveEvent {
    let t = 0;
    return {
      update: (dt) => {
        t += dt / 3;
        this.dimLights(Math.sin(Math.min(1, t) * Math.PI) * 0.6);
        return t < 1;
      },
      dispose: () => this.dimLights(0),
    };
  }

  private swarm(camPos: THREE.Vector3, camDir: THREE.Vector3): ActiveEvent {
    const count = 46;
    const pos = new Float32Array(count * 3);
    const seeds = Array.from({ length: count }, () => [Math.random(), Math.random(), Math.random()] as const);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = this.theme.particles === 'embers' ? 0xffa040 : this.theme.particles === 'snow' ? 0xbfe8ff : 0xc8ff8a;
    const mat = new THREE.PointsMaterial({ map: glowTexture(), color, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    const ahead = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    const origin = camPos.clone().addScaledVector(ahead, 3).setY(1.6);
    let t = 0;
    return {
      update: (dt, time) => {
        t += dt / 8;
        const travel = ahead.clone().multiplyScalar(t * 9);
        seeds.forEach(([a, b, c], i) => {
          const r = 0.6 + a * 1.2;
          const ang = time * (1 + b) + i;
          pos[i * 3] = origin.x + travel.x + Math.cos(ang) * r;
          pos[i * 3 + 1] = origin.y + Math.sin(time * 2 + c * 6) * 0.6 + (b - 0.5);
          pos[i * 3 + 2] = origin.z + travel.z + Math.sin(ang) * r;
        });
        (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        mat.opacity = Math.min(1, Math.min(t, 1 - t) * 5);
        return t < 1;
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
        pts.removeFromParent();
      },
    };
  }

  /** A translucent figure drifts across a distant intersection the player is looking down. */
  private ghost(camPos: THREE.Vector3, camDir: THREE.Vector3): ActiveEvent | null {
    const from = worldToCell(this.maze, camPos.x, camPos.z);
    // Find the corridor direction closest to where the player looks.
    let best = -1;
    let bestDot = 0.5;
    for (const d of DIRS) {
      const v = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)][d] as THREE.Vector3;
      const dot = v.dot(new THREE.Vector3(camDir.x, 0, camDir.z).normalize());
      if (dot > bestDot && isOpen(this.maze, from, d)) {
        best = d;
        bestDot = dot;
      }
    }
    if (best < 0) return null;
    const dir = best as 0 | 1 | 2 | 3;
    let cell = from;
    let steps = 0;
    while (steps < 6 && isOpen(this.maze, cell, dir)) {
      cell = neighbor(this.maze, cell, dir);
      steps++;
    }
    if (steps < 3) return null;
    const c = cellCenter(this.maze, cell);
    const side = new THREE.Vector3(dir % 2 === 0 ? 1 : 0, 0, dir % 2 === 0 ? 0 : 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 10), mat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fc0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }));
    halo.scale.setScalar(2.4);
    const g = new THREE.Group();
    g.add(body, halo);
    this.group.add(g);
    let t = 0;
    return {
      update: (dt, time) => {
        t += dt / 4.5;
        g.position.set(c.x, 1.25 + Math.sin(time * 2) * 0.1, c.z).addScaledVector(side, (t - 0.5) * 3.2);
        mat.opacity = Math.sin(Math.min(1, t) * Math.PI) * 0.35;
        (halo.material as THREE.SpriteMaterial).opacity = mat.opacity;
        return t < 1;
      },
      dispose: () => {
        body.geometry.dispose();
        mat.dispose();
        (halo.material as THREE.SpriteMaterial).dispose();
        g.removeFromParent();
      },
    };
  }

  dispose(): void {
    this.active?.dispose();
    this.active = null;
    this.group.clear();
  }
}
