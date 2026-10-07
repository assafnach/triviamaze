import * as THREE from 'three';
import type { QualityProfile } from '@/config/gameConfig';
import type { QualityLevel } from '@/types';
import { Rng } from '@/utils/rng';
import type { AudioEngine } from '../audio/AudioEngine';
import { CreatureManager } from '../creatures/CreatureManager';
import { BIOME_NEIGHBOURS } from '../environments/biomes';
import { THEMES, type ThemeDef } from '../environments/themes';
import { EventDirector } from '../events/EventDirector';
import { generateMaze } from '../maze/generator';
import { cellCenter } from '../maze/grid';
import { MazeWorld } from '../render/MazeWorld';

/** The living background of the title screen: a slow, cinematic glide through a real labyrinth. */
export class AttractScene {
  readonly scene = new THREE.Scene();
  private readonly path: THREE.CatmullRomCurve3;
  private readonly length: number;
  private t = 0;
  private dragonTimer = 6;
  private readonly lookTarget = new THREE.Vector3();
  private readonly lantern: THREE.PointLight;
  /** Reflection probe (owned here, created by the controller that has the renderer). */
  envProbe: THREE.WebGLRenderTarget | null = null;

  private constructor(
    readonly world: MazeWorld,
    private readonly creatures: CreatureManager,
    private readonly events: EventDirector,
    readonly theme: ThemeDef,
  ) {
    const maze = world.maze;
    const pts = maze.solution.map((c) => {
      const p = cellCenter(maze, c);
      return new THREE.Vector3(p.x, 1.9, p.z);
    });
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this.length = this.path.getLength();
    this.scene.background = new THREE.Color(theme.fogColor);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity * 0.9);
    this.lantern = new THREE.PointLight(theme.lanternColor, theme.lanternIntensity * 0.8, 11, 2);
    // Same light rig as a run (lantern + the route-hint light), so the shaders compiled for the
    // title are exactly the ones the run needs.
    const hintStandIn = new THREE.PointLight(0xffffff, 0, 10, 2);
    this.scene.add(world.group, creatures.group, events.group, this.lantern, hintStandIn);
  }

  static async create(
    theme: ThemeDef,
    quality: QualityProfile,
    seed: number,
    audio: AudioEngine,
    level: QualityLevel = 'medium',
    /** Precompiles a scene's shaders (creatures that arrive later are revealed once compiled). */
    warm?: (scene: THREE.Scene) => Promise<void>,
  ): Promise<AttractScene> {
    const maze = generateMaze(seed, '8-10');
    const rng = new Rng(seed);
    // A biome pair like a real run, so the run that follows reuses the title's compiled shaders.
    const themeB = THEMES[rng.pick(BIOME_NEIGHBOURS[theme.id])];
    const world = await MazeWorld.build(maze, theme, quality, undefined, themeB);
    let self: AttractScene | null = null;
    const cast = CreatureManager.begin(maze, (c) => world.themeAt(c), rng.fork('c'), { quality: level, eager: 0, background: true });
    const creatures = await CreatureManager.place(cast, world.collision, world, undefined, async () => {
      if (self && warm) await warm(self.scene);
    });
    const events = new EventDirector(maze, theme, rng.fork('e'), audio, () => undefined, () => undefined);
    self = new AttractScene(world, creatures, events, theme);
    return self;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, viewportHeight: number, reducedMotion: boolean): void {
    const speed = reducedMotion ? 0.5 : 1.15;
    this.t = (this.t + (dt * speed) / this.length) % 1;
    const u = Math.min(0.999, this.t);
    const p = this.path.getPointAt(u);
    const ahead = this.path.getPointAt(Math.min(0.999, u + 0.035));
    camera.position.copy(p);
    if (!reducedMotion) camera.position.y += Math.sin(time * 0.6) * 0.06;
    this.lookTarget.lerp(ahead.setY(1.75), Math.min(1, dt * 1.5));
    camera.lookAt(this.lookTarget);
    this.lantern.position.copy(camera.position);
    this.world.update(dt, time, camera, viewportHeight);
    this.creatures.update(dt, time, camera.position, reducedMotion);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.events.update(dt, time, camera.position, dir, true, reducedMotion);
    if (this.theme.openSky) {
      this.dragonTimer -= dt;
      if (this.dragonTimer <= 0) {
        this.dragonTimer = 28;
        this.events.trigger('dragon', camera.position, dir, reducedMotion);
      }
    }
  }

  dispose(): void {
    this.envProbe?.dispose();
    this.events.dispose();
    this.creatures.dispose();
    this.world.dispose();
    this.scene.clear();
  }
}
