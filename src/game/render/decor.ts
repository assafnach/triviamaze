import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAME_CONFIG, type QualityProfile } from '@/config/gameConfig';
import type { ThemeId } from '@/types';
import type { Rng } from '@/utils/rng';
import type { FlameSpec } from '../effects/Flames';
import type { LightSpot } from '../effects/TorchLights';
import type { ThemeDef } from '../environments/themes';
import { cellXY, degree, isOpen } from '../maze/grid';
import { DIRS, DX, DY, opposite, type Dir, type Maze, type Room } from '../maze/types';
import type { CollisionWorld } from '../player/collision';
import { chamferBox, column, columnDrum, nicheFrame } from './architecture';
import { assets, instanceProp, type PropTemplate } from './assets';
import { ChunkedAccumulator } from './geometry';
import { lavaMaterial, waterMaterial, waterfallMaterial, type LiquidMaterial } from './liquids';
import type { ThemeMaterials } from './materials';

const C = GAME_CONFIG.world.cellSize;
const T = GAME_CONFIG.world.wallThickness;

/**
 * Set dressing with a story: small scenes built from photoscanned props (a guard's post, a
 * forgotten storeroom, a reading nook, a wayside shrine, an abandoned camp, roots breaking
 * through masonry), hero set-pieces in the chambers, and staging around every creature.
 */

const COMMON = [
  'wine_barrel_01',
  'wooden_crate_01',
  'wooden_crate_02',
  'wooden_bucket_01',
  'wicker_basket_01',
  'wooden_stool_01',
  'wooden_candlestick',
  'wooden_lantern_01',
  'ceramic_vase_02',
  'stone_fire_pit',
  'namaqualand_boulder_02',
];

const BY_THEME: Record<ThemeId, string[]> = {
  ruins: ['kite_shield', 'antique_estoc', 'ornate_war_hammer', 'marble_bust_01', 'antique_ceramic_vase_01', 'ceramic_vase_02', 'rock_moss_set_01', 'rock_moss_set_02', 'root_cluster_01', 'fern_02', 'moss_01', 'tree_stump_01', 'dead_tree_trunk', 'gothic_statue', 'lion_head'],
  forest: ['rock_moss_set_01', 'rock_moss_set_02', 'root_cluster_01', 'fern_02', 'moss_01', 'tree_stump_01', 'dead_tree_trunk', 'namaqualand_boulder_02'],
  crystal: ['namaqualand_boulder_02', 'rock_face_01', 'rock_moss_set_02'],
  volcanic: ['namaqualand_boulder_02', 'rock_face_01', 'kite_shield', 'ornate_war_hammer'],
  temple: ['gothic_statue', 'marble_bust_01', 'lion_head', 'antique_ceramic_vase_01', 'ceramic_vase_02', 'book_encyclopedia_set_01', 'wooden_bookshelf_worn', 'large_castle_door', 'vintage_oil_lamp'],
  frozen: ['namaqualand_boulder_02', 'rock_moss_set_02', 'dead_tree_trunk', 'tree_stump_01', 'kite_shield', 'antique_estoc'],
  mystic: ['book_encyclopedia_set_01', 'wooden_bookshelf_worn', 'marble_bust_01', 'ceramic_vase_02', 'antique_ceramic_vase_01', 'vintage_oil_lamp'],
  castle: ['kite_shield', 'antique_estoc', 'ornate_war_hammer', 'wooden_bookshelf_worn', 'book_encyclopedia_set_01', 'marble_bust_01', 'gothic_statue', 'large_castle_door'],
};

/** Every model a set of biomes may place. */
export function decorAssets(ids: ThemeId[]): string[] {
  const out = new Set(COMMON);
  for (const id of ids) for (const n of BY_THEME[id]) out.add(n);
  return [...out];
}

type Vignette = 'guardPost' | 'storage' | 'library' | 'shrine' | 'overgrown' | 'fallen' | 'camp' | 'crystals' | 'rocks';

const VIGNETTES: Record<ThemeId, Partial<Record<Vignette, number>>> = {
  ruins: { storage: 2, guardPost: 2, shrine: 2, overgrown: 2.5, fallen: 2.5, camp: 1 },
  forest: { overgrown: 5, camp: 1.5, storage: 1, fallen: 1, rocks: 1.5 },
  crystal: { crystals: 4, rocks: 2, storage: 0.7, camp: 0.5 },
  volcanic: { rocks: 3, storage: 1, guardPost: 1, camp: 0.6 },
  temple: { shrine: 3, library: 2, storage: 1, guardPost: 1, fallen: 1 },
  frozen: { rocks: 3, storage: 1, guardPost: 1, crystals: 1 },
  mystic: { library: 3, shrine: 2, crystals: 1.5 },
  castle: { guardPost: 3, storage: 2, library: 1, shrine: 1 },
};

export interface DecorHost {
  maze: Maze;
  quality: QualityProfile;
  collision: CollisionWorld;
  materials: ThemeMaterials;
  flameSpecs: FlameSpec[];
  lightSpots: LightSpot[];
  wallHeight: number;
  roofed: boolean;
  themeAt(cell: number): ThemeDef;
  isReserved(cell: number): boolean;
}

/** Where (and how) a creature is staged at its encounter. */
export interface EncounterStage {
  /** Closed wall the creature stands against (null = corner of an all-open junction). */
  dir: Dir | null;
}

export interface DecorSet {
  group: THREE.Group;
  stages: Map<number, EncounterStage>;
  update(time: number): void;
  dispose(): void;
}

interface WallFrame {
  cell: number;
  dir: Dir;
  base: THREE.Vector3;
  inward: THREE.Vector3;
  tangent: THREE.Vector3;
  yaw: number;
}

function wallFrame(maze: Maze, cell: number, d: Dir): WallFrame {
  const { x, y } = cellXY(maze, cell);
  const toWall = new THREE.Vector3(DX[d], 0, DY[d]);
  const inward = toWall.clone().negate();
  return {
    cell,
    dir: d,
    base: new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2).addScaledVector(toWall, C / 2 - T / 2),
    inward,
    tangent: new THREE.Vector3(-toWall.z, 0, toWall.x),
    yaw: Math.atan2(inward.x, inward.z),
  };
}

const at = (f: WallFrame, t: number, o: number, y = 0): THREE.Vector3 => f.base.clone().addScaledVector(f.tangent, t).addScaledVector(f.inward, o).setY(y);

/** Collects prop placements and turns them into one instanced draw per prop sub-mesh. */
class PropBatch {
  private readonly placed = new Map<string, THREE.Matrix4[]>();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(private readonly lib: Map<string, PropTemplate>) {}

  has(name: string): boolean {
    return this.lib.has(name);
  }

  size(name: string): THREE.Vector3 {
    const t = this.lib.get(name);
    return t ? t.box.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
  }

  /**
   * Places a prop with its footprint centred on `pos` and its base at `pos.y`.
   * `tilt` (x, z) leans it in its own frame (e.g. a shield resting against a wall).
   */
  add(name: string, pos: THREE.Vector3, yaw: number, scale = 1, tilt: [number, number] = [0, 0]): boolean {
    const t = this.lib.get(name);
    if (!t) return false;
    const c = t.box.getCenter(new THREE.Vector3());
    const local = new THREE.Matrix4().makeTranslation(-c.x, -t.box.min.y, -c.z);
    this.q.setFromEuler(this.e.set(tilt[0], yaw, tilt[1], 'YXZ'));
    const m = new THREE.Matrix4().compose(pos, this.q, new THREE.Vector3(scale, scale, scale)).multiply(local);
    let list = this.placed.get(name);
    if (!list) {
      list = [];
      this.placed.set(name, list);
    }
    list.push(m);
    return true;
  }

  build(group: THREE.Group): void {
    for (const [name, mats] of this.placed) {
      const t = this.lib.get(name);
      if (t) group.add(instanceProp(t, mats));
    }
  }
}

/** Hexagonal crystal cluster (prisms with pyramidal tips) — crystals really are this shape. */
function crystalCluster(rng: Rng, count: number, size: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const h = size * rng.range(0.45, 1) * (i === 0 ? 1.25 : 1);
    const r = h * rng.range(0.11, 0.17);
    const prism = new THREE.CylinderGeometry(r, r * 1.05, h, 6, 1);
    prism.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.2, 6, 1);
    tip.translate(0, h + r * 1.1, 0);
    const g = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()]) as THREE.BufferGeometry;
    prism.dispose();
    tip.dispose();
    const a = rng.range(0, Math.PI * 2);
    const lean = i === 0 ? rng.range(0, 0.15) : rng.range(0.25, 0.8);
    q.setFromEuler(new THREE.Euler(Math.cos(a) * lean, rng.range(0, 6), Math.sin(a) * lean));
    m.compose(new THREE.Vector3(Math.cos(a) * size * 0.12 * (i ? 1 : 0), -r * 0.6, Math.sin(a) * size * 0.12 * (i ? 1 : 0)), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const out = mergeGeometries(parts) as THREE.BufferGeometry;
  for (const p of parts) p.dispose();
  out.computeVertexNormals();
  return out;
}

export async function buildDecor(host: DecorHost, rng: Rng): Promise<DecorSet> {
  const { maze, collision, materials: mats, flameSpecs, lightSpots, quality } = host;
  const ids = new Set<ThemeId>();
  for (let c = 0; c < maze.width * maze.height; c++) ids.add(host.themeAt(c).id);
  const lib = await assets.resolveAll(decorAssets([...ids]));
  const batch = new PropBatch(lib);
  const group = new THREE.Group();
  group.name = 'decor';
  const disposables: { dispose(): void }[] = [];
  const animated: ((t: number) => void)[] = [];
  const stone = new ChunkedAccumulator(C * 6);
  const crystalGeos: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  const stages = new Map<number, EncounterStage>();
  const flame = (p: THREE.Vector3, size: number, color: number): void => {
    flameSpecs.push({ position: p, size, color: new THREE.Color(color) });
  };
  const light = (p: THREE.Vector3, color: number, intensity: number, distance: number, flicker: number): void => {
    lightSpots.push({ position: p, color, intensity, distance, flicker });
  };
  const block = (cell: number, p: THREE.Vector3, r: number): void => {
    collision.addCircle(cell, { x: p.x, z: p.z, r });
  };
  const addStone = (geo: THREE.BufferGeometry, m: THREE.Matrix4): void => {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    stone.get('trim', p.x, p.z).append(geo, m, 2.2);
  };
  const drum = columnDrum(0.32, 0.7);
  disposables.push(drum);

  // ── Vignettes ──────────────────────────────────────────────────────────────────────

  const candle = (p: THREE.Vector3, yaw: number): void => {
    if (batch.add('wooden_candlestick', p, yaw, 1.1)) flame(p.clone().setY(p.y + 0.27), 0.13, 0xffb060);
  };

  const guardPost = (f: WallFrame): void => {
    batch.add('wooden_stool_01', at(f, -0.45, 0.6), f.yaw + rng.range(-0.6, 0.6));
    const barrel = at(f, 0.55, 0.42);
    batch.add('wine_barrel_01', barrel, rng.range(0, 6), 0.95);
    block(f.cell, barrel, 0.36);
    const lamp = barrel.clone().setY(0.93);
    if (batch.add('wooden_lantern_01', lamp, rng.range(0, 6))) {
      flame(lamp.clone().setY(1.16), 0.16, 0xffb060);
      light(lamp.clone().setY(1.3).addScaledVector(f.inward, 0.3), 0xffb36a, 4, 6, 0.12);
    }
    batch.add('kite_shield', at(f, -1.1, 0.14), f.yaw + rng.range(-0.15, 0.15), 0.95, [-0.2, 0]);
    if (rng.chance(0.5)) batch.add('antique_estoc', at(f, 1.15, 0.1), f.yaw + Math.PI / 2, 1, [0, 0.16]);
    else batch.add('ornate_war_hammer', at(f, 1.1, 0.1), f.yaw, 1, [-0.25, 0]);
    batch.add('ceramic_vase_02', at(f, -0.15, 0.85), rng.range(0, 6), 0.9);
    block(f.cell, at(f, -0.45, 0.6), 0.24);
  };

  const storage = (f: WallFrame): void => {
    const b1 = at(f, -1.0, 0.38);
    const b2 = at(f, -0.42, 0.36);
    batch.add('wine_barrel_01', b1, rng.range(0, 6));
    batch.add('wine_barrel_01', b2, rng.range(0, 6), 0.85);
    block(f.cell, b1, 0.38);
    block(f.cell, b2, 0.32);
    const cr = at(f, 0.62, 0.3);
    batch.add('wooden_crate_02', cr, f.yaw + Math.PI / 2 + rng.range(-0.08, 0.08));
    batch.add('wooden_crate_01', cr.clone().setY(0.46), f.yaw + rng.range(-0.2, 0.2));
    block(f.cell, cr, 0.42);
    batch.add('wooden_bucket_01', at(f, 0.1, 0.62), rng.range(0, 6));
    batch.add('wicker_basket_01', at(f, 1.25, 0.55), rng.range(0, 6));
  };

  const library = (f: WallFrame): void => {
    const shelf = at(f, -0.25, 0.3);
    batch.add('wooden_bookshelf_worn', shelf, f.yaw);
    block(f.cell, at(f, -0.75, 0.32), 0.34);
    block(f.cell, at(f, 0.25, 0.32), 0.34);
    batch.add('book_encyclopedia_set_01', at(f, 0.95, 0.35), f.yaw + rng.range(-0.4, 0.4));
    batch.add('wooden_stool_01', at(f, 0.9, 0.85), rng.range(0, 6));
    const cnd = at(f, 0.9, 0.85, 0.44);
    candle(cnd, 0);
    light(cnd.clone().setY(1.2), 0xffb060, 3.2, 5, 0.15);
  };

  const shrine = (f: WallFrame): void => {
    const niche = nicheFrame(0.9, 1.25, 0.95, 0.3);
    const m = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.base);
    addStone(niche, m);
    niche.dispose();
    const inside = at(f, 0, 0.13, 1.0);
    if (rng.chance(0.6)) batch.add('marble_bust_01', inside, f.yaw);
    else batch.add(rng.pick(['antique_ceramic_vase_01', 'ceramic_vase_02']), inside, rng.range(0, 6), 1.3);
    candle(at(f, -0.36, 0.22, 1.0), 0);
    candle(at(f, 0.36, 0.22, 1.0), 0);
    batch.add('antique_ceramic_vase_01', at(f, -0.75, 0.3), rng.range(0, 6), 1.2);
    batch.add('ceramic_vase_02', at(f, 0.7, 0.28), rng.range(0, 6), 1.3);
    light(at(f, 0, 0.7, 1.6), 0xffc070, 3.5, 5, 0.12);
  };

  const overgrown = (f: WallFrame): void => {
    batch.add('root_cluster_01', at(f, rng.range(-0.4, 0.4), 0.15, -0.05), f.yaw + rng.range(-0.3, 0.3), rng.range(0.42, 0.55));
    batch.add('fern_02', at(f, rng.range(-1.1, -0.5), 0.45), rng.range(0, 6), rng.range(0.55, 0.75));
    if (rng.chance(0.6)) batch.add('fern_02', at(f, rng.range(0.6, 1.1), 0.4), rng.range(0, 6), rng.range(0.5, 0.7));
    batch.add('rock_moss_set_02', at(f, rng.range(-0.6, 0.6), 0.35), rng.range(0, 6), rng.range(0.12, 0.16));
    for (let i = 0; i < 6; i++) batch.add('moss_01', at(f, rng.range(-1.3, 1.3), rng.range(0.1, 0.9)), rng.range(0, 6), rng.range(1.5, 3));
    if (rng.chance(0.35)) batch.add('tree_stump_01', at(f, rng.pick([-1.0, 1.0]), 0.55), rng.range(0, 6), 0.55);
  };

  const fallen = (f: WallFrame): void => {
    // A toppled column: drums rolled against the wall, a stump still standing.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.yaw + Math.PI / 2 + rng.range(-0.3, 0.3), Math.PI / 2, 'YXZ'));
    for (let i = 0; i < 2; i++) {
      const p = at(f, -0.9 + i * 0.78, 0.5 + rng.range(-0.05, 0.1), 0.31);
      addStone(drum, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    }
    const stump = column(0.3, 2.2, rng.range(0.8, 1.3));
    addStone(stump, new THREE.Matrix4().makeTranslation(at(f, 0.95, 0.5).x, 0, at(f, 0.95, 0.5).z));
    stump.dispose();
    block(f.cell, at(f, -0.5, 0.5), 0.45);
    block(f.cell, at(f, 0.95, 0.5), 0.45);
    if (batch.has('rock_moss_set_01')) batch.add('rock_moss_set_01', at(f, 0.1, 0.4), rng.range(0, 6), 0.1);
    if (batch.has('fern_02') && rng.chance(0.6)) batch.add('fern_02', at(f, 0.3, 0.55), rng.range(0, 6), 0.5);
  };

  const camp = (f: WallFrame): void => {
    // Dead end: an abandoned camp around a fire.
    const pit = at(f, 0, 1.25);
    batch.add('stone_fire_pit', pit, rng.range(0, 6), 0.75);
    flame(pit.clone().setY(0.25), 0.85, 0xff8a3a);
    light(pit.clone().setY(0.9), 0xff9448, 9, 8, 0.3);
    block(f.cell, pit, 0.6);
    batch.add('wooden_stool_01', at(f, -1.05, 1.0), rng.range(0, 6));
    batch.add('wooden_stool_01', at(f, 1.05, 1.45), rng.range(0, 6));
    batch.add('ceramic_vase_02', at(f, -0.75, 0.55), rng.range(0, 6), 0.9);
    batch.add('wooden_bucket_01', at(f, 0.9, 0.45), rng.range(0, 6));
    batch.add('wicker_basket_01', at(f, -1.2, 0.5), rng.range(0, 6));
    batch.add('wine_barrel_01', at(f, 0.25, 0.35), rng.range(0, 6));
    block(f.cell, at(f, 0.25, 0.35), 0.34);
  };

  const crystals = (f: WallFrame): void => {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const p = at(f, rng.range(-1.1, 1.1), rng.range(0.2, 0.5));
      const g = crystalCluster(rng, rng.int(4, 7), rng.range(0.5, 1.2));
      crystalGeos.push({ geo: g, matrix: new THREE.Matrix4().makeRotationY(rng.range(0, 6)).setPosition(p) });
      if (i === 0) light(p.clone().setY(0.8).addScaledVector(f.inward, 0.4), host.themeAt(f.cell).runeColor, 3, 5, 0.04);
    }
    if (batch.has('namaqualand_boulder_02')) batch.add('namaqualand_boulder_02', at(f, rng.range(-0.8, 0.8), 0.45), f.yaw + rng.range(-0.4, 0.4), rng.range(0.32, 0.45));
  };

  const rocks = (f: WallFrame): void => {
    const p = at(f, rng.range(-0.7, 0.7), 0.5);
    if (batch.add('namaqualand_boulder_02', p, f.yaw + Math.PI / 2 + rng.range(-0.4, 0.4), rng.range(0.4, 0.6))) block(f.cell, p, 0.45);
    if (batch.has('rock_moss_set_02')) batch.add('rock_moss_set_02', at(f, rng.range(-1, 1), 0.35), rng.range(0, 6), rng.range(0.1, 0.14));
    if (host.themeAt(f.cell).id === 'volcanic' && rng.chance(0.5)) {
      const g = crystalCluster(rng, 3, 0.5);
      crystalGeos.push({ geo: g, matrix: new THREE.Matrix4().makeRotationY(rng.range(0, 6)).setPosition(at(f, rng.range(-1, 1), 0.25)) });
    }
  };

  const make: Record<Vignette, (f: WallFrame) => void> = { guardPost, storage, library, shrine, overgrown, fallen, camp, crystals, rocks };

  const pickVignette = (cell: number, deadEnd: boolean): Vignette | null => {
    const table = VIGNETTES[host.themeAt(cell).id];
    const entries = (Object.entries(table) as [Vignette, number][])
      .filter(([k]) => (k === 'camp' ? deadEnd : true) && !(k === 'library' && !lib.has('wooden_bookshelf_worn')))
      .map(([k, w]): [Vignette, number] => [k, deadEnd && (k === 'camp' || k === 'shrine') ? w * 3 : w]);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let r = rng.next() * total;
    for (const [kind, w] of entries) {
      r -= w;
      if (r <= 0) return kind;
    }
    return entries[entries.length - 1]?.[0] ?? null;
  };

  const used = new Set<number>();
  const n = maze.width * maze.height;
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  for (const cell of order) {
    if (host.isReserved(cell) || (maze.room[cell] as number) >= 0) continue;
    const deg = degree(maze, cell);
    const deadEnd = deg === 1;
    const chance = (deadEnd ? 0.8 : 0.3) * Math.min(1, quality.propDensity + 0.15);
    if (!rng.chance(chance)) continue;
    const closed = DIRS.filter((d) => !isOpen(maze, cell, d) && !(cell === maze.start && d === maze.startDir) && !(cell === maze.exit && d === maze.exitDir));
    if (closed.length === 0) continue;
    // In a dead end, dress the far wall (the one facing the only way in).
    const only = deadEnd ? DIRS.find((d) => isOpen(maze, cell, d)) : undefined;
    const d = only !== undefined && closed.includes(opposite(only)) ? opposite(only) : rng.pick(closed);
    const kind = pickVignette(cell, deadEnd);
    if (!kind) continue;
    make[kind](wallFrame(maze, cell, d));
    used.add(cell);
  }

  // ── Rubble: fallen stones gathered at the feet of walls ───────────────────────────
  if (batch.has('namaqualand_boulder_02')) {
    for (let cell = 0; cell < n; cell++) {
      if (host.isReserved(cell) || used.has(cell) || (maze.room[cell] as number) >= 0) continue;
      for (const d of DIRS) {
        if (isOpen(maze, cell, d) || !rng.chance(0.28 * quality.propDensity)) continue;
        const f = wallFrame(maze, cell, d);
        const t0 = rng.range(-1.2, 1.2);
        const k = rng.int(1, 3);
        for (let i = 0; i < k; i++) {
          batch.add('namaqualand_boulder_02', at(f, t0 + rng.range(-0.35, 0.35), rng.range(0.12, 0.35), -0.02), rng.range(0, 6), rng.range(0.06, 0.13), [rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)]);
        }
      }
    }
  }

  // ── Encounter staging ──────────────────────────────────────────────────────────────

  for (const e of maze.encounters) {
    const cell = e.cell;
    const closed = DIRS.filter((d) => !isOpen(maze, cell, d));
    // Stand facing the way the player arrives (toward the entrance), so they meet it head-on.
    const back = DIRS.find((d) => isOpen(maze, cell, d) && (maze.distFromStart[cellNeighbor(maze, cell, d)] as number) < (maze.distFromStart[cell] as number));
    const dir = back !== undefined && closed.includes(opposite(back)) ? opposite(back) : closed.length > 0 ? rng.pick(closed) : null;
    stages.set(cell, { dir });
    if (dir === null) continue;
    const f = wallFrame(maze, cell, dir);
    const theme = host.themeAt(cell);
    const warm = theme.light.color;
    // A soft key light from the front so every creature reads clearly.
    light(at(f, 0.6, 2.1, 2.4), theme.lanternColor, 5, 6.5, 0.05);
    switch (theme.id) {
      case 'ruins':
      case 'castle':
      case 'temple':
      case 'mystic': {
        // Framed by a blind arch with candles at its feet.
        const niche = nicheFrame(1.55, 2.6, 0.02, 0.22);
        addStone(niche, new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.base));
        niche.dispose();
        candle(at(f, -1.15, 0.35), 0);
        candle(at(f, -1.3, 0.55), 0);
        candle(at(f, 1.2, 0.4), 0);
        batch.add('antique_ceramic_vase_01', at(f, 1.3, 0.3), rng.range(0, 6), 1.3);
        // Candle glow from beside the creature (never inside it: a point light that close burns a hot spot).
        light(at(f, -1.25, 0.6, 0.5), 0xffb060, 2.5, 3.5, 0.15);
        break;
      }
      case 'forest': {
        batch.add('root_cluster_01', at(f, 0, 0.1, -0.05), f.yaw, 0.5);
        batch.add('fern_02', at(f, -1.1, 0.4), rng.range(0, 6), 0.7);
        batch.add('fern_02', at(f, 1.15, 0.45), rng.range(0, 6), 0.65);
        for (let i = 0; i < 5; i++) batch.add('moss_01', at(f, rng.range(-1.3, 1.3), rng.range(0.1, 0.7)), rng.range(0, 6), 2.5);
        const pit = at(f, 1.15, 1.35);
        batch.add('stone_fire_pit', pit, rng.range(0, 6), 0.5);
        flame(pit.clone().setY(0.18), 0.55, 0xff8a3a);
        light(pit.clone().setY(0.7), 0xff9448, 6, 6, 0.3);
        block(cell, pit, 0.4);
        break;
      }
      case 'crystal':
      case 'frozen': {
        for (const side of [-1, 1]) {
          const g = crystalCluster(rng, rng.int(5, 8), rng.range(0.6, 0.95));
          crystalGeos.push({ geo: g, matrix: new THREE.Matrix4().makeRotationY(rng.range(0, 6)).setPosition(at(f, side * 1.2, 0.3)) });
        }
        light(at(f, 1.25, 0.7, 0.6), theme.runeColor, 3, 4, 0.04);
        break;
      }
      case 'volcanic': {
        const pit = at(f, -1.1, 1.0);
        batch.add('stone_fire_pit', pit, rng.range(0, 6), 0.55);
        flame(pit.clone().setY(0.2), 0.7, warm);
        light(pit.clone().setY(0.8), warm, 7, 6, 0.35);
        block(cell, pit, 0.42);
        batch.add('namaqualand_boulder_02', at(f, 1.1, 0.45), f.yaw + 0.5, 0.35);
        break;
      }
    }
  }

  // ── Hero set-pieces in the chambers ───────────────────────────────────────────────

  const liquids: LiquidMaterial[] = [];
  for (const room of maze.rooms) heroRoom(room);

  function heroRoom(room: Room): void {
    const cx = (room.x + room.w / 2) * C;
    const cz = (room.y + room.h / 2) * C;
    const center = new THREE.Vector3(cx, 0, cz);
    const cell = Math.min(n - 1, Math.floor(cz / C) * maze.width + Math.floor(cx / C));
    const theme = host.themeAt(cell);
    const span = Math.min(room.w, room.h) * C;
    const reach = span / 2 - 1.9;
    const cells: number[] = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells.push(y * maze.width + x);
    const blockAll = (p: THREE.Vector3, r: number): void => {
      for (const c of cells) {
        const { x, y } = cellXY(maze, c);
        const dx = Math.max(x * C - p.x, 0, p.x - (x + 1) * C);
        const dz = Math.max(y * C - p.z, 0, p.z - (y + 1) * C);
        if (Math.hypot(dx, dz) < r + 0.1) collision.addCircle(c, { x: p.x, z: p.z, r });
      }
    };
    switch (theme.id) {
      case 'ruins':
      case 'castle':
        courtyard(center, reach, blockAll, theme);
        break;
      case 'temple':
      case 'mystic':
        sanctum(center, reach, blockAll, theme);
        break;
      case 'forest':
        grove(center, reach, blockAll, theme);
        break;
      case 'crystal':
      case 'frozen':
        lake(center, reach, blockAll, theme, room);
        break;
      case 'volcanic':
        forge(center, reach, blockAll, theme);
        break;
    }
  }

  type Blocker = (p: THREE.Vector3, r: number) => void;

  function plinth(center: THREE.Vector3, w: number, h: number): void {
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const s = w * (1 - i * 0.16);
      const g = chamferBox(s, h / steps, s, 0.04);
      addStone(g, new THREE.Matrix4().makeTranslation(center.x, (h / steps) * (i + 0.5), center.z));
      g.dispose();
    }
  }

  function statue(center: THREE.Vector3, baseH: number, height: number, yaw: number): void {
    const s = height / batch.size('gothic_statue').y;
    batch.add('gothic_statue', center.clone().setY(baseH), yaw, s);
  }

  /** Ruined courtyard: a colossal statue on a stepped plinth, columns, a still pool. */
  function courtyard(center: THREE.Vector3, reach: number, blockAll: Blocker, theme: ThemeDef): void {
    const pw = Math.min(2.4, reach * 1.25);
    plinth(center, pw, 0.9);
    statue(center, 0.9, host.roofed ? Math.min(3.6, host.wallHeight * 1.7 - 1.3) : 4.6, rng.range(0, 6));
    blockAll(center, pw * 0.62);
    // Uplights at the plinth corners: fire bowls on short columns.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(pw * 0.62 + 0.55));
      const col = column(0.16, 1.15, 0);
      addStone(col, new THREE.Matrix4().makeTranslation(p.x, 0, p.z));
      col.dispose();
      flame(p.clone().setY(1.36), 0.55, theme.light.color);
      if (i % 2 === 0) light(p.clone().setY(1.6), theme.light.color, 9, 9, 0.22);
      blockAll(p, 0.32);
    }
    light(center.clone().setY(5.5).add(new THREE.Vector3(1.5, 0, 1.5)), 0x9fb4ff, 6, 10, 0);
    // Broken colonnade fragments near the walls.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(reach + 0.95));
      const col = column(0.3, host.wallHeight * 0.9, rng.chance(0.6) ? rng.range(0.6, 2.2) : 0);
      addStone(col, new THREE.Matrix4().makeTranslation(p.x, 0, p.z));
      col.dispose();
      blockAll(p, 0.42);
      if (rng.chance(0.6)) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6), Math.PI / 2, 'YXZ'));
        const dp = p.clone().add(new THREE.Vector3(rng.range(-0.8, 0.8), 0.31, rng.range(-0.8, 0.8)));
        addStone(drum, new THREE.Matrix4().compose(dp, q, new THREE.Vector3(1, 1, 1)));
      }
      if (batch.has('fern_02')) batch.add('fern_02', p.clone().add(new THREE.Vector3(0.5, 0, 0.3)), rng.range(0, 6), 0.6);
    }
  }

  /** Temple sanctum: statue on a high dais flanked by fire, a sealed great door. */
  function sanctum(center: THREE.Vector3, reach: number, blockAll: Blocker, theme: ThemeDef): void {
    const pw = Math.min(2.2, reach * 1.2);
    plinth(center, pw, 1.1);
    if (batch.has('gothic_statue')) statue(center, 1.1, Math.min(3.4, host.wallHeight * 1.7 - 1.6), rng.range(0, 6));
    blockAll(center, pw * 0.62);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(pw * 0.62 + 0.6));
      const col = column(0.14, 1.3, 0);
      addStone(col, new THREE.Matrix4().makeTranslation(p.x, 0, p.z));
      col.dispose();
      flame(p.clone().setY(1.5), 0.6, theme.light.color);
      light(p.clone().setY(1.8), theme.light.color, 8, 8, 0.2);
      blockAll(p, 0.3);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(pw * 0.5 + 0.25));
      candle(p.clone().setY(0), 0);
    }
  }

  /** Forest grove: a ring of standing stones around a mossy altar stone. */
  function grove(center: THREE.Vector3, reach: number, blockAll: Blocker, theme: ThemeDef): void {
    const ring = Math.max(1.6, reach + 0.4);
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(ring));
      // Weathered standing stones, some leaning, one fallen.
      const h = rng.range(1.7, 2.6);
      const fallen = i === 3;
      const slab = chamferBox(rng.range(0.55, 0.75), h, rng.range(0.32, 0.42), 0.08);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(fallen ? Math.PI / 2 : rng.range(-0.08, 0.08), a + Math.PI / 2, fallen ? 0 : rng.range(-0.1, 0.1), 'YXZ'));
      const pos = p.clone().setY(fallen ? 0.18 : h / 2 - 0.1);
      addStone(slab, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      slab.dispose();
      blockAll(p, 0.45);
      batch.add('moss_01', p.clone().add(new THREE.Vector3(0.3, 0, 0.2)), rng.range(0, 6), 3);
    }
    // Rune-carved altar stone at the heart of the circle.
    const altar = chamferBox(1.3, 0.75, 0.8, 0.07);
    addStone(altar, new THREE.Matrix4().makeRotationY(rng.range(0, 6)).setPosition(center.x, 0.37, center.z));
    altar.dispose();
    blockAll(center, 0.95);
    batch.add('root_cluster_01', center.clone().add(new THREE.Vector3(0.4, 0, -0.3)), rng.range(0, 6), 0.45);
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      batch.add('fern_02', center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rng.range(1.0, 1.4))), rng.range(0, 6), rng.range(0.6, 0.85));
    }
    light(center.clone().setY(1.6), theme.runeColor, 10, 9, 0.06);
    light(center.clone().setY(5), 0xbfd8ff, 5, 10, 0);
  }

  /** Crystal lake: a still pool with a waterfall spilling from a cliff and giant crystals. */
  function lake(center: THREE.Vector3, reach: number, blockAll: Blocker, theme: ThemeDef, room: Room): void {
    const r = Math.max(1.6, reach + 0.6);
    const water = waterMaterial(theme.id === 'frozen' ? 0x8aa4b8 : 0x0b1824, theme.id === 'frozen' ? 0 : 0x0e3a4c);
    if (theme.id === 'frozen') {
      water.material.roughness = 0.25;
      water.material.opacity = 1;
    }
    liquids.push(water);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 48), water.material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(center).setY(0.06);
    pool.receiveShadow = true;
    group.add(pool);
    disposables.push(pool.geometry, water.material);
    // Rim of rocks.
    const rim = Math.round(r * 5);
    for (let i = 0; i < rim; i++) {
      const a = (i / rim) * Math.PI * 2;
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r + rng.range(-0.1, 0.15)));
      batch.add('rock_moss_set_02', p, rng.range(0, 6), rng.range(0.08, 0.12));
    }
    blockAll(center, r + 0.1);
    // Crystal spires in the water.
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, Math.PI * 2);
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rng.range(0, r * 0.55)));
      const g = crystalCluster(rng, rng.int(5, 9), i === 0 ? 2.6 : rng.range(1.2, 1.8));
      crystalGeos.push({ geo: g, matrix: new THREE.Matrix4().makeRotationY(rng.range(0, 6)).setPosition(p) });
      if (i === 0) light(p.clone().setY(2.2), theme.runeColor, 14, 12, 0.05);
    }
    // A cascade pouring from a fissure in the vault into the pool, with mist at its foot.
    {
      const a = rng.range(0, Math.PI * 2);
      const foot = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r * 0.72));
      const top = host.roofed ? host.wallHeight * 1.7 : host.wallHeight + 1.5;
      const fall = waterfallMaterial();
      liquids.push(fall);
      const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, top, 18, 8, true), fall.material);
      sheet.position.copy(foot).setY(top / 2);
      group.add(sheet);
      disposables.push(sheet.geometry, fall.material);
      const foam = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.25, 32), fall.material);
      foam.rotation.x = -Math.PI / 2;
      foam.position.copy(foot).setY(0.09);
      group.add(foam);
      disposables.push(foam.geometry);
      light(foot.clone().setY(1.6), 0x9fd8ff, 6, 7, 0.08);
      if (batch.has('rock_moss_set_02')) batch.add('rock_moss_set_02', foot.clone(), rng.range(0, 6), 0.14);
    }
    void room;
  }

  /** Volcanic forge: a lava pool ringed by obsidian with braziers. */
  function forge(center: THREE.Vector3, reach: number, blockAll: Blocker, theme: ThemeDef): void {
    const r = Math.max(1.4, reach + 0.4);
    const lava = lavaMaterial();
    liquids.push(lava);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lava.material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(center).setY(0.05);
    group.add(pool);
    disposables.push(pool.geometry, lava.material);
    blockAll(center, r + 0.1);
    const rim = Math.round(r * 4);
    for (let i = 0; i < rim; i++) {
      const a = (i / rim) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r + 0.05));
      batch.add('namaqualand_boulder_02', p, a + rng.range(-0.4, 0.4), rng.range(0.22, 0.32));
    }
    light(center.clone().setY(1.2), 0xff5a1a, 16, 12, 0.18);
    for (let i = 0; i < 2; i++) {
      const g = crystalCluster(rng, 6, 1.4);
      const a = rng.range(0, 6);
      crystalGeos.push({ geo: g, matrix: new THREE.Matrix4().makeRotationY(a).setPosition(center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r * 0.4))) });
    }
    void theme;
  }

  // ── Assemble ───────────────────────────────────────────────────────────────────────

  batch.build(group);
  for (const [, a] of stone.entries()) {
    const geo = a.build();
    const mesh = new THREE.Mesh(geo, mats.trim);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    disposables.push(geo);
  }
  if (crystalGeos.length > 0) {
    const parts = crystalGeos.map(({ geo, matrix }) => geo.applyMatrix4(matrix));
    const merged = mergeGeometries(parts) as THREE.BufferGeometry;
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, mats.crystal);
    group.add(mesh);
    disposables.push(merged);
  }

  return {
    group,
    stages,
    update(time: number) {
      for (const l of liquids) l.update(time);
      for (const a of animated) a(time);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

function cellNeighbor(maze: Maze, c: number, d: Dir): number {
  return c + DX[d] + DY[d] * maze.width;
}
