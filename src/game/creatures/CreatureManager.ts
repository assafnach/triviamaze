import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/gameConfig';
import { CREATURE_TEXT, type CreatureText } from '@/content/he/creatures';
import { g, type G } from '@/content/he/gender';
import type { AddressForm, CreatureId, QualityLevel } from '@/types';
import type { Rng } from '@/utils/rng';
import type { ThemeDef } from '../environments/themes';
import { cellXY, isOpen, neighbor, openDirs } from '../maze/grid';
import { DIRS, DX, DY, opposite, type Dir, type EncounterSite, type Maze, type SpecialSite } from '../maze/types';
import type { Circle, CollisionWorld } from '../player/collision';
import { emptyRig, type BuildContext, type SkinnedRig } from './rig';
import { Creature } from './Creature';
import { SPECIAL_SPECIES, SPECIES } from './species';

export { Creature };

/** What the manager needs to know about the world it populates. */
export interface CreatureWorld {
  themeAt(cell: number): ThemeDef;
  stages: Map<number, { dir: Dir | null }>;
}

const VOXEL_SCALE: Record<QualityLevel, number> = { low: 1.45, medium: 1.15, high: 1, ultra: 0.85 };

const C = GAME_CONFIG.world.cellSize;
const T = GAME_CONFIG.world.wallThickness;

export type EncounterState = 'waiting' | 'noticed' | 'engaged' | 'done';

export interface EncounterRuntime {
  index: number;
  site: EncounterSite;
  creatureId: CreatureId;
  creature: Creature;
  state: EncounterState;
  correct: boolean | null;
  lastRevisit: number;
  collider: Circle | null;
  /** The creature already called out to a player who walked in looking elsewhere. */
  called: boolean;
  /** The sculpted creature has arrived (encounters only trigger once it stands there). */
  ready: boolean;
}

export interface SpecialRuntime {
  site: SpecialSite;
  creature: Creature;
  used: boolean;
  ready: boolean;
}

/** A cast being sculpted (see `CreatureManager.begin`). */
export interface CastBuild {
  maze: Maze;
  rng: Rng;
  ids: CreatureId[];
  rigs: Promise<SkinnedRig>[];
  specialRigs: Promise<SkinnedRig>[];
  order: number[];
  eager: number;
  abort: AbortController;
}

/** Where a creature stands: against a wall of its junction (or in a corner), facing into the cell. */
interface Slot {
  cell: number;
  center: THREE.Vector3;
  /** Direction toward the wall it backs onto (null: corner of an all-open junction). */
  toWall: THREE.Vector3 | null;
  corner: [number, number];
}

export class CreatureManager {
  readonly group = new THREE.Group();
  readonly encounters: EncounterRuntime[] = [];
  readonly specials: SpecialRuntime[] = [];

  private constructor(
    private readonly maze: Maze,
    private readonly rng: Rng,
    private readonly world: CreatureWorld | null,
    private readonly abort: AbortController,
  ) {}

  /**
   * Casts and builds every creature of a run. Sculpted species are meshed on worker threads in
   * parallel; `onProgress` reports the fraction built.
   */
  /**
   * Casts a run and starts sculpting it straight away (route order, on the worker pool). The cast
   * only depends on the maze and its biomes, so this can begin before the world is built;
   * `place` then stands everyone in their spots.
   */
  static begin(
    maze: Maze,
    themeAt: (cell: number) => ThemeDef,
    rng: Rng,
    opts: {
      quality?: QualityLevel;
      /** How many of the nearest encounters the run waits for (the rest stream in while exploring). */
      eager?: number;
      /** Coarser sculpts without face passes (title-screen background cast). */
      background?: boolean;
    } = {},
  ): CastBuild {
    const quality = opts.quality ?? 'high';
    const base: BuildContext = { quality, voxelScale: VOXEL_SCALE[quality] * (opts.background ? 1.5 : 1), faces: !opts.background };
    const abort = new AbortController();
    // Creatures met first are meshed first; a background cast always yields to a real run.
    const ctx = (priority: number): BuildContext => ({ ...base, job: { priority: opts.background ? -1 : priority, signal: abort.signal } });
    // A cast without repeats within a run, drawn from each encounter's own biome.
    const pools = new Map<string, CreatureId[]>();
    const used = new Set<CreatureId>();
    const ids = maze.encounters.map((site) => {
      const t = themeAt(site.cell);
      let pool = pools.get(t.id);
      if (!pool) {
        pool = rng.shuffle(t.creatures);
        pools.set(t.id, pool);
      }
      const id = pool.find((c) => !used.has(c)) ?? (pool[0] as CreatureId);
      used.add(id);
      return id;
    });
    const order = maze.encounters.map((_, i) => i).sort((a, b) => (maze.encounters[a] as EncounterSite).order - (maze.encounters[b] as EncounterSite).order);
    const eager = Math.min(order.length, opts.eager ?? order.length);
    const rigs = new Array<Promise<SkinnedRig>>(ids.length);
    order.forEach((i, rank) => {
      rigs[i] = SPECIES[ids[i] as CreatureId](ctx(rank < eager ? 2 : 1));
    });
    const specialRigs = maze.specials.map((site) => SPECIAL_SPECIES[site.kind](ctx(0)));
    for (const p of [...rigs, ...specialRigs]) p.catch(() => undefined);
    return { maze, rng, ids, rigs, specialRigs, order, eager, abort };
  }

  /** Places the cast in the world; resolves once the nearest (eager) creatures stand in place. */
  static async place(
    cast: CastBuild,
    collision: CollisionWorld,
    world: CreatureWorld | null,
    onProgress?: (p: number) => void,
    /** Compiles a late arrival's shaders while it is still hidden (avoids a hitch mid-play). */
    warm?: (obj: THREE.Object3D) => Promise<void>,
  ): Promise<CreatureManager> {
    const { maze } = cast;
    const m = new CreatureManager(maze, cast.rng, world, cast.abort);
    m.warm = warm ?? null;
    // Stand-ins first: every placement decision is made now, so none depends on build order.
    maze.encounters.forEach((site, i) => {
      const slot = m.slot(site.cell);
      const { pos, yaw } = m.place(slot, 0.45);
      const creature = new Creature(emptyRig(), pos, yaw);
      m.slots.set(creature, slot);
      m.encounters.push({ index: i, site, creatureId: cast.ids[i] as CreatureId, creature, state: 'waiting', correct: null, lastRevisit: -999, collider: null, called: false, ready: false });
    });
    for (const site of maze.specials) {
      const { x, y } = cellXY(maze, site.cell);
      const center = new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2);
      const back = opposite(site.facing);
      const pos = center.clone().add(new THREE.Vector3(DX[back], 0, DY[back]).multiplyScalar(0.55));
      const creature = new Creature(emptyRig(), pos, Math.atan2(DX[site.facing], DY[site.facing]));
      collision.addCircle(site.cell, { x: pos.x, z: pos.z, r: 0.5 });
      m.specials.push({ site, creature, used: false, ready: false });
    }
    let done = 0;
    const arrivals = cast.order.map((i) =>
      (cast.rigs[i] as Promise<SkinnedRig>).then((rig) => {
        m.attach(m.encounters[i] as EncounterRuntime, rig, collision);
        done++;
        if (done <= cast.eager) onProgress?.(done / Math.max(1, cast.eager));
      }),
    );
    const specials = cast.specialRigs.map((p, i) => p.then((rig) => m.attachSpecial(m.specials[i] as SpecialRuntime, rig)));
    m.pending = Promise.all([...arrivals.slice(cast.eager), ...specials]).catch((err: unknown) => {
      if (!(err instanceof DOMException && err.name === 'AbortError')) console.error('[creatures] build failed', err);
    });
    await Promise.all(arrivals.slice(0, cast.eager));
    return m;
  }

  /** Cast and place in one go (when nothing else needs to overlap with the sculpting). */
  static async create(
    maze: Maze,
    theme: ThemeDef,
    collision: CollisionWorld,
    rng: Rng,
    opts: { world?: CreatureWorld; quality?: QualityLevel; onProgress?: (p: number) => void; eager?: number; background?: boolean } = {},
  ): Promise<CreatureManager> {
    const world = opts.world ?? null;
    const cast = CreatureManager.begin(maze, (c) => (world ? world.themeAt(c) : theme), rng, opts);
    return CreatureManager.place(cast, collision, world, opts.onProgress);
  }

  private disposed = false;
  private warm: ((obj: THREE.Object3D) => Promise<void>) | null = null;

  /** Shows a newly sculpted creature once its shaders are ready. */
  private reveal(root: THREE.Object3D, done: () => void): void {
    if (!this.warm || !root.parent?.parent) {
      done();
      return;
    }
    root.visible = false;
    // Never wait on the compiler for long: a creature must always appear.
    Promise.race([this.warm(root), new Promise<void>((r) => setTimeout(r, 4000))])
      .catch(() => undefined)
      .then(() => {
        if (this.disposed) return;
        root.visible = true;
        done();
      });
  }
  private readonly slots = new Map<Creature, Slot>();
  /** Resolves when every creature has been sculpted. */
  pending: Promise<unknown> = Promise.resolve();

  private slot(cell: number): Slot {
    const { x, y } = cellXY(this.maze, cell);
    const center = new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2);
    const closed = DIRS.filter((d) => !isOpen(this.maze, cell, d));
    const staged = this.world?.stages.get(cell)?.dir;
    const corner: [number, number] = [this.rng.chance(0.5) ? 1 : -1, this.rng.chance(0.5) ? 1 : -1];
    if (closed.length === 0) return { cell, center, toWall: null, corner };
    const d = staged !== undefined && staged !== null && closed.includes(staged) ? staged : (this.rng.pick(closed) as Dir);
    return { cell, center, toWall: new THREE.Vector3(DX[d], 0, DY[d]), corner };
  }

  /** Long-bodied creatures stand further out so their tails clear the wall when they turn. */
  private place(slot: Slot, reach: number): { pos: THREE.Vector3; yaw: number } {
    if (slot.toWall) {
      const inset = C / 2 - T / 2 - Math.max(0.45, reach + 0.12);
      const pos = slot.center.clone().addScaledVector(slot.toWall, inset);
      return { pos, yaw: Math.atan2(-slot.toWall.x, -slot.toWall.z) };
    }
    const [sx, sz] = slot.corner;
    return { pos: slot.center.clone().add(new THREE.Vector3(sx * 1.15, 0, sz * 1.15)), yaw: Math.atan2(-sx, -sz) };
  }

  /** Swaps a stand-in for its finished sculpt, keeping whatever mood the encounter is in. */
  private attach(e: EncounterRuntime, rig: SkinnedRig, collision: CollisionWorld): void {
    if (this.disposed) {
      for (const d of rig.disposables) d.dispose();
      return;
    }
    const slot = this.slots.get(e.creature) as Slot;
    const box = rig.mesh.geometry.boundingBox;
    const reach = box ? Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z)) * 0.8 : rig.radius;
    const { pos, yaw } = this.place(slot, Math.max(rig.radius, reach));
    const creature = new Creature(rig, pos, yaw);
    creature.setMood(e.creature.mood);
    this.slots.set(creature, slot);
    e.creature.dispose();
    e.creature = creature;
    this.group.add(rig.root);
    e.collider = rig.flying && !rig.perch ? null : collision.addCircle(e.site.cell, { x: pos.x, z: pos.z, r: rig.perch ? 0.3 : rig.radius });
    this.reveal(rig.root, () => {
      e.ready = true;
    });
  }

  private attachSpecial(sp: SpecialRuntime, rig: SkinnedRig): void {
    if (this.disposed) {
      for (const d of rig.disposables) d.dispose();
      return;
    }
    const creature = new Creature(rig, sp.creature.home, sp.creature.homeYaw);
    creature.setMood(sp.creature.mood);
    sp.creature.dispose();
    sp.creature = creature;
    this.group.add(rig.root);
    this.reveal(rig.root, () => {
      sp.ready = true;
    });
  }

  /**
   * The encounter the player has reached. The camera never turns on its own, so a creature only
   * starts talking once it is in view (or the player is right beside it); a player who walks into
   * the junction looking elsewhere is called to first.
   */
  findTrigger(px: number, pz: number, playerCell: number, fx: number, fz: number): { e: EncounterRuntime; kind: 'start' | 'call' } | null {
    for (const e of this.encounters) {
      if (!e.ready || e.state === 'done' || e.state === 'engaged') continue;
      const p = e.creature.home;
      const vx = p.x - px;
      const vz = p.z - pz;
      const d = Math.hypot(vx, vz);
      const inView = d > 0.01 && (vx * fx + vz * fz) / d > 0.45;
      if (d < 1.9) return { e, kind: 'start' };
      if (inView && (d < GAME_CONFIG.encounter.triggerDistance + 1.2 || playerCell === e.site.cell)) return { e, kind: 'start' };
      if (playerCell === e.site.cell && !e.called) {
        e.called = true;
        return { e, kind: 'call' };
      }
    }
    return null;
  }

  /** Creatures that newly notice the player this frame. */
  updateNotice(px: number, pz: number, playerCell: number): EncounterRuntime[] {
    const out: EncounterRuntime[] = [];
    for (const e of this.encounters) {
      if (!e.ready || e.state !== 'waiting') continue;
      const p = e.creature.home;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < GAME_CONFIG.encounter.noticeDistance && (d < 6 || this.lineOfSight(playerCell, e.site.cell))) {
        e.state = 'noticed';
        e.creature.setMood('notice');
        out.push(e);
      }
    }
    return out;
  }

  /** Straight open corridor between two cells? */
  lineOfSight(a: number, b: number): boolean {
    if (a === b) return true;
    const pa = cellXY(this.maze, a);
    const pb = cellXY(this.maze, b);
    if (pa.x !== pb.x && pa.y !== pb.y) return false;
    const d: Dir = pa.x === pb.x ? (pb.y < pa.y ? 0 : 2) : pb.x < pa.x ? 3 : 1;
    let c = a;
    for (let i = 0; i < 12; i++) {
      if (!isOpen(this.maze, c, d)) return false;
      c = neighbor(this.maze, c, d);
      if (c === b) return true;
    }
    return false;
  }

  update(dt: number, t: number, playerPos: THREE.Vector3, reducedMotion: boolean): void {
    for (const e of this.encounters) {
      const near = playerPos.distanceTo(e.creature.home) < 14;
      e.creature.lookTarget = near && e.state !== 'done' ? playerPos : near && e.correct ? playerPos : null;
      e.creature.update(dt, t, reducedMotion);
      // Walkers carry their collider with them as they step toward the doorway.
      if (e.collider && !e.creature.rig.flying) {
        e.collider.x = e.creature.worldPosition.x;
        e.collider.z = e.creature.worldPosition.z;
      }
    }
    for (const s of this.specials) {
      s.creature.lookTarget = playerPos.distanceTo(s.creature.home) < 8 ? playerPos : null;
      s.creature.update(dt, t, reducedMotion);
    }
  }

  line(e: EncounterRuntime, kind: keyof Omit<CreatureText, 'name' | 'title'>, address: AddressForm, vars: Record<string, string> = {}): string {
    const options = CREATURE_TEXT[e.creatureId][kind] as G[];
    const text = g(this.rng.pick(options), address);
    return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  }

  /** Re-open an encounter that was interrupted (e.g. the clock ran out mid-question). */
  reset(e: EncounterRuntime): void {
    e.state = 'noticed';
    e.creature.speaking = false;
    e.creature.setMood('idle');
  }

  nearestSpecial(px: number, pz: number, reach: number): SpecialRuntime | null {
    for (const s of this.specials) {
      if (s.used || !s.ready) continue;
      if (Math.hypot(s.creature.home.x - px, s.creature.home.z - pz) < reach) return s;
    }
    return null;
  }

  /** Neighbouring open directions of an encounter cell (used for the verbal hint). */
  exits(e: EncounterRuntime): Dir[] {
    return openDirs(this.maze, e.site.cell);
  }

  /** Stops casting: queued sculpts are dropped and late arrivals discarded (GPU resources stay until dispose). */
  stop(): void {
    this.disposed = true;
    // Drop this cast's queued sculpts so they never delay the next scene.
    this.abort.abort();
  }

  dispose(): void {
    this.stop();
    for (const e of this.encounters) e.creature.dispose();
    for (const s of this.specials) s.creature.dispose();
    this.group.clear();
  }
}
