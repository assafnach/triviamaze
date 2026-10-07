import * as THREE from 'three';
import { GAME_CONFIG, type QualityProfile } from '@/config/gameConfig';
import { Rng } from '@/utils/rng';
import { AmbientParticles } from '../effects/AmbientParticles';
import { Flames, type FlameSpec } from '../effects/Flames';
import { Smoke } from '../effects/Smoke';
import { TorchLights, type LightSpot } from '../effects/TorchLights';
import { BIOME_LOOK, biomeTextures, biomeWeights, type BiomeLook } from '../environments/biomes';
import type { ThemeDef } from '../environments/themes';
import { cellXY, degree, isOpen, neighbor } from '../maze/grid';
import { DIRS, DX, DY, opposite, type Dir, type Maze } from '../maze/types';
import { CollisionWorld } from '../player/collision';
import { masonryArch, pilaster, chamferBox, type ArchPieces } from './architecture';
import { assets } from './assets';
import { buildDecor, decorAssets, type DecorSet, type EncounterStage } from './decor';
import { createMazeFields, type MazeFields } from './envMaterial';
import { ChunkedAccumulator, archGeometry, rockGeometry } from './geometry';
import { createThemeMaterials, type ThemeMaterials } from './materials';
import { createPbrThemeMaterials } from './pbrMaterials';
import { scatterProps, type PropSet } from './props';
import { createSky, type Sky } from './sky';
import { portalTexture, runeCircleTexture } from './textures';

const C = GAME_CONFIG.world.cellSize;
const T = GAME_CONFIG.world.wallThickness;
const P = T * 1.3;
const ARCH_OPENING = C - T - 0.55;
const ARCH_FRAME = 0.3;

export interface Doorway {
  /** Centre of the shared edge, on the floor. */
  center: THREE.Vector3;
  /** Unit vector pointing from the junction cell into the target cell. */
  outward: THREE.Vector3;
  glow: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  runes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

export interface ExitPortal {
  position: THREE.Vector3;
  /** Points from the door into the labyrinth. */
  inward: THREE.Vector3;
  open: number;
  light: THREE.PointLight;
  update(dt: number, time: number, playerDist: number): void;
}

export interface EntranceGate {
  setClosed(amount: number): void;
}

const tmpColor = new THREE.Color();

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Edge between cell (x, y) and its neighbour in direction d (or the boundary). */
function edgeCenter(x: number, y: number, d: Dir): THREE.Vector3 {
  const cx = x * C + C / 2 + (DX[d] * C) / 2;
  const cz = y * C + C / 2 + (DY[d] * C) / 2;
  return new THREE.Vector3(cx, 0, cz);
}

export class MazeWorld {
  readonly group = new THREE.Group();
  readonly collision: CollisionWorld;
  materials!: ThemeMaterials;
  /** Per-cell weight of the second biome (0 = this run's first biome, 1 = the second). */
  readonly biomeW: Float32Array;
  fields!: MazeFields;
  /** Photoscanned PBR materials are in use (falls back to procedural textures if loading fails). */
  pbr = false;
  readonly doorways = new Map<string, Doorway>();
  readonly lightSpots: LightSpot[] = [];
  readonly flameSpecs: FlameSpec[] = [];
  flames!: Flames;
  torchLights!: TorchLights;
  particles!: AmbientParticles;
  /** The second biome's own particle field and forest leaves, faded by the crossover. */
  private particlesB: AmbientParticles | null = null;
  private leaves: AmbientParticles | null = null;
  private smoke: Smoke | null = null;
  sky!: Sky;
  exit!: ExitPortal;
  gate!: EntranceGate;
  props!: PropSet;
  decor: DecorSet | null = null;
  /** How each creature is staged at its encounter (wall it stands against). */
  get stages(): Map<number, EncounterStage> {
    return this.decor?.stages ?? new Map();
  }
  moonLight: THREE.DirectionalLight | null = null;
  private readonly hemi: THREE.HemisphereLight;
  private readonly animators: ((dt: number, time: number) => void)[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly rng: Rng;
  private readonly roofed: boolean;
  private readonly H: number;

  private constructor(
    readonly maze: Maze,
    readonly theme: ThemeDef,
    readonly quality: QualityProfile,
    readonly themeB: ThemeDef | null,
  ) {
    this.rng = new Rng(maze.seed ^ 0x51ed);
    this.roofed = !theme.openSky;
    this.H = theme.wallHeight;
    this.collision = new CollisionWorld(maze);
    this.biomeW = themeB ? biomeWeights(maze.distFromStart, maze.exit) : new Float32Array(maze.width * maze.height);
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
    this.group.add(this.hemi);
  }

  static async build(maze: Maze, theme: ThemeDef, quality: QualityProfile, onProgress?: (p: number) => void, themeB: ThemeDef | null = null): Promise<MazeWorld> {
    const w = new MazeWorld(maze, theme, quality, themeB);
    w.fields = createMazeFields(
      maze.width,
      maze.height,
      C,
      T / 2,
      (c) => w.biomeW[c] as number,
      (c, d) => !isOpen(maze, c, d),
    );
    onProgress?.(0.05);
    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).get('pbr') === '0') throw new Error('disabled by ?pbr=0');
      const ids = themeB ? [theme.id, themeB.id] : [theme.id];
      await assets.preload(decorAssets(ids), biomeTextures(...ids), (p) => onProgress?.(0.05 + p * 0.3));
      w.materials = await createPbrThemeMaterials(theme, themeB, w.fields, quality.textureSize);
      w.pbr = true;
    } catch (e) {
      console.warn('[world] scanned materials unavailable, using procedural textures', e);
      w.materials = createThemeMaterials(theme, quality.textureSize);
    }
    w.disposables.push(w.fields.biome, w.fields.walls);
    onProgress?.(0.4);
    await nextFrame();
    w.buildStructure();
    onProgress?.(0.5);
    await nextFrame();
    w.buildFixtures();
    if (w.pbr) {
      w.decor = await buildDecor(
        {
          maze,
          quality,
          collision: w.collision,
          materials: w.materials,
          flameSpecs: w.flameSpecs,
          lightSpots: w.lightSpots,
          wallHeight: w.H,
          roofed: w.roofed,
          themeAt: (c) => w.themeAt(c),
          isReserved: (c) => w.isReserved(c),
        },
        w.rng.fork('decor'),
      );
      w.group.add(w.decor.group);
      w.disposables.push(w.decor);
    } else {
      w.buildRooms();
    }
    onProgress?.(0.6);
    await nextFrame();
    w.props = w.scatter(theme, (c) => !w.themeB || (w.biomeW[c] as number) <= 0.5);
    if (themeB) {
      const extra = w.scatter(themeB, (c) => (w.biomeW[c] as number) > 0.5);
      const both = [w.props, extra];
      w.props = {
        group: new THREE.Group().add(w.props.group, extra.group),
        update: (t) => both.forEach((p) => p.update(t)),
        dispose: () => both.forEach((p) => p.dispose()),
      };
    }
    w.group.add(w.props.group);
    w.disposables.push(w.props);
    onProgress?.(0.75);
    await nextFrame();
    w.buildGate();
    w.buildExit();
    w.buildDoorwayMarkers();
    w.buildAtmosphere();
    onProgress?.(0.9);
    return w;
  }

  /** The biome a cell belongs to (its dominant one in the crossover zone). */
  themeAt(cell: number): ThemeDef {
    return this.themeB && (this.biomeW[cell] as number) > 0.5 ? this.themeB : this.theme;
  }

  /** A biome parameter blended across the crossover. */
  private blend(cell: number, f: (l: BiomeLook) => number): number {
    const a = f(BIOME_LOOK[this.theme.id]);
    if (!this.themeB) return a;
    const w = this.biomeW[Math.max(0, Math.min(this.biomeW.length - 1, cell))] as number;
    return a + (f(BIOME_LOOK[this.themeB.id]) - a) * w;
  }

  /** Small procedural dressing (rubble, vines, runes…) for the cells of one biome. */
  private scatter(theme: ThemeDef, mine: (cell: number) => boolean): PropSet {
    // With scanned props in place, keep only the details that the model library doesn't cover.
    const keep = new Set(['runes', 'lavacracks', 'icicles', 'banners']);
    const t = this.pbr ? { ...theme, props: theme.props.filter((p) => keep.has(p)) } : theme;
    return scatterProps(this.maze, t, this.materials, this.quality, this.rng.fork(`props-${theme.id}`), this.flameSpecs, (cell) => this.isReserved(cell) || !mine(cell));
  }

  /** A free spot in a cell to (re)spawn the player: the centre unless a set-piece stands there. */
  safeSpawn(cell: number): THREE.Vector3 {
    const c = this.cellCenter(cell);
    if (this.collision.isFree(c.x, c.z, 0.45)) return c;
    for (const r of [1.2, 1.6, 2.0]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        if (this.collision.isFree(x, z, 0.45)) return new THREE.Vector3(x, 0, z);
      }
    }
    return c;
  }

  /** Cells where nothing should be scattered (creatures, specials, start, exit). */
  private isReserved(cell: number): boolean {
    return (
      cell === this.maze.start ||
      cell === this.maze.exit ||
      this.maze.encounters.some((e) => e.cell === cell) ||
      this.maze.specials.some((s) => s.cell === cell)
    );
  }

  // ── Structure ────────────────────────────────────────────────────────────────────────

  private roomHeight(): number {
    return this.H * 1.7;
  }

  /** Height of a wall/lintel on side d of cell c. */
  private sideHeight(c: number, d: Dir): number {
    const { x, y } = cellXY(this.maze, c);
    const nx = x + DX[d];
    const ny = y + DY[d];
    const inside = nx >= 0 && ny >= 0 && nx < this.maze.width && ny < this.maze.height;
    const ra = this.maze.room[c] as number;
    const rb = inside ? (this.maze.room[ny * this.maze.width + nx] as number) : -1;
    if (this.roofed && ra !== rb && (ra >= 0 || rb >= 0)) return this.roomHeight();
    return this.H;
  }

  private edgeClosed(x: number, y: number, d: Dir): boolean {
    const { width: w, height: h } = this.maze;
    if (x >= 0 && y >= 0 && x < w && y < h) return !isOpen(this.maze, y * w + x, d);
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) return !isOpen(this.maze, ny * w + nx, opposite(d));
    return false;
  }

  private buildStructure(): void {
    const { maze, theme, quality } = this;
    const acc = new ChunkedAccumulator(C * 6);
    const seg = quality.propDensity > 0.8 ? [10, 7] : quality.propDensity > 0.5 ? [6, 4] : [3, 2];
    const hedge = !this.pbr && theme.wall.pattern === 'hedge';
    const baseAmp = hedge ? 0.13 : theme.wall.pattern === 'ice' ? 0.05 : 0.07;
    const wallUV = theme.wall.scale;
    const disp = (x: number, y: number, z: number, amp: number): number =>
      amp *
      (Math.sin(x * 1.7 + y * 2.3) * 0.45 +
        Math.sin(z * 2.1 - y * 1.3 + 1.7) * 0.3 +
        Math.sin((x + z) * 4.3 + y * 3.1) * 0.15 +
        (hedge ? Math.sin(x * 7.1 + z * 6.3 + y * 5.7) * 0.35 : 0));

    const segRng = this.rng.fork('walls');
    const buildWall = (x: number, y: number, d: Dir, height: number): void => {
      const along: 'x' | 'z' = d === 0 || d === 2 ? 'x' : 'z';
      const f = along === 'x' ? (d === 0 ? y * C : (y + 1) * C) : d === 3 ? x * C : (x + 1) * C;
      const a0 = (along === 'x' ? x * C : y * C) + P / 2;
      const a1 = (along === 'x' ? (x + 1) * C : (y + 1) * C) - P / 2;
      const midX = along === 'x' ? (a0 + a1) / 2 : f;
      const midZ = along === 'x' ? f : (a0 + a1) / 2;
      const target = acc.get('wall', midX, midZ);
      const cell = y * maze.width + x;
      const amp = this.pbr ? this.blend(cell, (l) => l.relief) : baseAmp;
      // Ruined tops: some segments crumble (never under a roof).
      const crumble = this.pbr ? (this.roofed ? 0 : this.blend(cell, (l) => l.crumble)) : theme.id === 'ruins' ? 0.4 : 0;
      const ruin = segRng.chance(crumble) ? segRng.range(0.4, 1.4) : 0;
      const ruinCenter = segRng.range(0.25, 0.75);
      const ruinSeed = segRng.range(0, 100);
      const top = (s: number): number => {
        let h = height;
        if (ruin > 0) {
          // Broken masonry: a ragged breach that steps down course by course.
          const k = Math.max(0, 1 - Math.abs(s - ruinCenter) * 2.4) ** 0.6;
          const ragged = Math.sin(s * 37 + ruinSeed) * 0.5 + Math.sin(s * 91 + ruinSeed * 2.3) * 0.3;
          const drop = ruin * k + ragged * 0.12 * Math.min(1, k * 3);
          if (drop > 0.05) h -= Math.ceil(drop / 0.23) * 0.23;
        }
        if (hedge) h += Math.sin(s * Math.PI) * 0.12;
        return h;
      };
      const segS = ruin > 0 ? Math.max(seg[0]!, 26) : seg[0]!;
      const point = (s: number, t: number, side: number, out: THREE.Vector3): void => {
        const a = a0 + (a1 - a0) * s;
        const yy = top(s) * t;
        const wx = along === 'x' ? a : f;
        const wz = along === 'x' ? f : a;
        const off = side * (T / 2 + disp(wx, yy, wz, amp) * Math.min(1, t * 6));
        if (along === 'x') out.set(a, yy, f + off);
        else out.set(f + off, yy, a);
      };
      const uvFace = (p: THREE.Vector3): [number, number] => [(along === 'x' ? p.x : p.z) / wallUV, p.y / wallUV];
      // +side face, -side face.
      target.grid(segS, seg[1]!, (s, t, o) => point(s, t, 1, o), uvFace, along === 'x');
      target.grid(segS, seg[1]!, (s, t, o) => point(s, t, -1, o), uvFace, along !== 'x');
      // Top.
      target.grid(
        segS,
        1,
        (s, t, o) => {
          point(s, 1, t * 2 - 1, o);
        },
        (p) => [(along === 'x' ? p.x : p.z) / wallUV, (along === 'x' ? p.z : p.x) / wallUV],
        along === 'z',
      );
      if (theme.id === 'castle') this.crenellate(acc, along, f, a0, a1, height);
      if (this.pbr) {
        // Base course and (on intact open-air walls) a coping along the top.
        const len = a1 - a0;
        const rot = along === 'x' ? 0 : Math.PI / 2;
        const plinth = plinthGeo(len);
        tmpM.makeRotationY(rot).setPosition(midX, 0.17, midZ);
        acc.get('trim', midX, midZ).append(plinth, tmpM, wallUV);
        if (!this.roofed && ruin === 0) {
          tmpM.makeRotationY(rot).setPosition(midX, height + 0.07, midZ);
          acc.get('trim', midX, midZ).append(copingGeo(len), tmpM, wallUV);
        }
      }
    };
    const plinthCache = new Map<number, THREE.BufferGeometry>();
    const copingCache = new Map<number, THREE.BufferGeometry>();
    const plinthGeo = (len: number): THREE.BufferGeometry => {
      const k = Math.round(len * 100);
      let g = plinthCache.get(k);
      if (!g) {
        g = chamferBox(len, 0.34, T + 0.16, 0.035);
        plinthCache.set(k, g);
        this.disposables.push(g);
      }
      return g;
    };
    const copingGeo = (len: number): THREE.BufferGeometry => {
      const k = Math.round(len * 100);
      let g = copingCache.get(k);
      if (!g) {
        g = chamferBox(len + 0.02, 0.16, T + 0.14, 0.03);
        copingCache.set(k, g);
        this.disposables.push(g);
      }
      return g;
    };

    const tmpM = new THREE.Matrix4();
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(box);
    const addBox = (key: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, uv = wallUV): void => {
      tmpM.compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      acc.get(key, cx, cz).append(box, tmpM, uv);
    };

    // Walls and lintels.
    const { width: w, height: h } = maze;
    const archEdges: { x: number; y: number; d: Dir }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = y * w + x;
        const sides: Dir[] = [0, 3];
        if (y === h - 1) sides.push(2);
        if (x === w - 1) sides.push(1);
        for (const d of sides) {
          const height = this.sideHeight(c, d);
          if (!isOpen(maze, c, d)) {
            buildWall(x, y, d, height);
          } else {
            if (height > this.H) {
              // Lintel above a doorway into a tall chamber.
              const ec = edgeCenter(x, y, d);
              const along = d === 0 || d === 2;
              addBox('wall', ec.x, (this.H + height) / 2, ec.z, along ? C - P : T, height - this.H, along ? T : C - P);
            }
            const n = neighbor(maze, c, d);
            const junction = degree(maze, c) >= 3 || degree(maze, n) >= 3;
            const roomEdge = (maze.room[c] as number) !== (maze.room[n] as number);
            const sameRoom = (maze.room[c] as number) >= 0 && maze.room[c] === maze.room[n];
            if (!sameRoom && (junction || roomEdge || this.rng.chance(0.16))) archEdges.push({ x, y, d });
          }
        }
      }
    }

    // Corner posts wherever walls meet.
    const hedgePost = hedge;
    const postRng = this.rng.fork('posts');
    const pilasterCache = new Map<string, THREE.BufferGeometry[]>();
    const pilasterGeo = (height: number, broken: number): THREE.BufferGeometry => {
      const key = `${height.toFixed(2)}|${broken > 0 ? 1 : 0}`;
      let list = pilasterCache.get(key);
      if (!list) {
        list = [0, 1, 2].map(() => pilaster(P, height, !this.roofed, postRng, broken > 0 ? postRng.range(0.3, 0.7) : 0));
        pilasterCache.set(key, list);
        this.disposables.push(...list);
      }
      return postRng.pick(list);
    };
    for (let vy = 0; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        const incident: [number, number, Dir][] = [
          [vx, vy - 1, 3], // north-going edge = west side of (vx, vy-1)
          [vx, vy, 3], // south-going
          [vx - 1, vy, 0], // west-going = north side of (vx-1, vy)
          [vx, vy, 0], // east-going
        ];
        let maxH = 0;
        let any = false;
        for (const [cx, cy, d] of incident) {
          if (!this.edgeClosed(cx, cy, d)) continue;
          any = true;
          const inside = cx >= 0 && cy >= 0 && cx < w && cy < h;
          const cell = inside ? cy * w + cx : Math.max(0, Math.min(w * h - 1, (cy + DY[d]) * w + cx + DX[d]));
          maxH = Math.max(maxH, inside ? this.sideHeight(cell, d) : this.H);
        }
        // Lintels also need posts.
        for (const [cx, cy, d] of incident) {
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
          const sh = this.sideHeight(cy * w + cx, d);
          if (sh > this.H) {
            any = true;
            maxH = Math.max(maxH, sh);
          }
        }
        if (!any) continue;
        const px = vx * C;
        const pz = vy * C;
        if (hedgePost) {
          addBox('wall', px, (maxH + 0.1) / 2, pz, P * 1.05, maxH + 0.1, P * 1.05);
          continue;
        }
        if (this.pbr) {
          const postH = this.roofed ? maxH : maxH + 0.25;
          const cell = Math.min(w - 1, vx) + Math.min(h - 1, vy) * w;
          const broken = !this.roofed && postRng.chance(this.blend(cell, (l) => l.crumble) * 0.3) ? postRng.range(0.25, 0.7) : 0;
          tmpM.makeRotationY(postRng.int(0, 3) * (Math.PI / 2)).setPosition(px, 0, pz);
          acc.get('trim', px, pz).append(pilasterGeo(postH, broken), tmpM, wallUV);
          continue;
        }
        const postH = this.roofed ? maxH : maxH + 0.25;
        addBox('trim', px, postH / 2, pz, P, postH, P);
        addBox('trim', px, 0.18, pz, P * 1.22, 0.36, P * 1.22);
        if (!this.roofed) addBox('trim', px, postH + 0.09, pz, P * 1.28, 0.18, P * 1.28);
        else addBox('trim', px, maxH - 0.35, pz, P * 1.2, 0.2, P * 1.2);
      }
    }

    // Arches over passages.
    const spring = Math.min(2.3, this.H - 1.85);
    const arch = archGeometry(ARCH_OPENING, spring, ARCH_FRAME, 0.55);
    this.disposables.push(arch);
    const archRng = this.rng.fork('arches');
    const masonry: ArchPieces[] = [];
    if (this.pbr) {
      for (let i = 0; i < 4; i++) masonry.push(masonryArch(ARCH_OPENING, spring, ARCH_FRAME, 0.62, archRng, { damaged: i === 3 }));
      for (const m of masonry) this.disposables.push(m.dressed, m.fill);
    }
    for (const { x, y, d } of archEdges) {
      const ec = edgeCenter(x, y, d);
      const rot = d === 0 || d === 2 ? 0 : Math.PI / 2;
      tmpM.makeRotationY(rot + (archRng.chance(0.5) ? Math.PI : 0)).setPosition(ec.x, 0, ec.z);
      if (this.pbr) {
        const cell = y * w + x;
        const damaged = !this.roofed && archRng.chance(this.blend(cell, (l) => l.crumble) * 0.5);
        const piece = damaged ? (masonry[3] as ArchPieces) : (masonry[archRng.int(0, 2)] as ArchPieces);
        acc.get('trim', ec.x, ec.z).append(piece.dressed, tmpM, wallUV);
        acc.get('wall', ec.x, ec.z).append(piece.fill, tmpM, wallUV);
      } else {
        acc.get(theme.wall.pattern === 'hedge' ? 'wood' : 'trim', ec.x, ec.z).append(arch, tmpM, theme.wall.pattern === 'hedge' ? undefined : wallUV);
      }
      this.addArchColliders(x, y, d, ec);
      this.registerDoorway(x, y, d, ec);
    }

    // Floor.
    const floorUV = theme.floor.scale;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = x * C;
        const z0 = y * C;
        acc.get('floor', x0 + C / 2, z0 + C / 2).grid(
          2,
          2,
          (s, t, o) => o.set(x0 + s * C, 0, z0 + t * C),
          (p) => [p.x / floorUV, p.z / floorUV],
          false,
        );
      }
    }

    // Ceiling and beams (roofed themes).
    if (this.roofed) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = y * w + x;
          const room = (maze.room[c] as number) >= 0;
          const ch = room ? this.roomHeight() : this.H;
          const x0 = x * C;
          const z0 = y * C;
          const sag = this.pbr ? this.blend(c, (l) => l.ceilingRelief) : 0;
          const cseg = sag > 0 ? 5 : 1;
          acc.get('ceiling', x0 + C / 2, z0 + C / 2).grid(
            cseg,
            cseg,
            (s, t, o) => {
              const wx = x0 + s * C;
              const wz = z0 + t * C;
              const bulge = Math.sin(Math.PI * s) * Math.sin(Math.PI * t);
              const n = 0.6 + 0.4 * Math.sin(wx * 1.3 + wz * 0.7) * Math.cos(wz * 1.1 - wx * 0.4);
              o.set(wx, ch - sag * bulge * n, wz);
            },
            (p) => [p.x / 4, p.z / 4],
            true,
          );
          if (!room && this.rng.chance(0.45)) {
            const vertical = isOpen(maze, c, 0) || isOpen(maze, c, 2);
            addBox(
              'trim',
              x0 + C / 2,
              this.H - 0.18,
              z0 + C / 2,
              vertical ? C - T : 0.32,
              0.36,
              vertical ? 0.32 : C - T,
            );
          }
        }
      }
    }

    // Build meshes.
    const matFor: Record<string, THREE.Material> = {
      wall: this.materials.wall,
      trim: this.materials.trim,
      floor: this.materials.floor,
      ceiling: this.materials.ceiling,
      wood: this.materials.wood,
    };
    for (const [key, a] of acc.entries()) {
      const geo = a.build();
      const mesh = new THREE.Mesh(geo, matFor[key]);
      mesh.receiveShadow = true;
      mesh.castShadow = key === 'wall' || key === 'trim';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
  }

  private crenellate(acc: ChunkedAccumulator, along: 'x' | 'z', f: number, a0: number, a1: number, height: number): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4();
    const count = 3;
    for (let i = 0; i < count; i++) {
      const a = a0 + ((i + 0.5) / count) * (a1 - a0);
      const x = along === 'x' ? a : f;
      const z = along === 'x' ? f : a;
      m.compose(
        new THREE.Vector3(x, height + 0.25, z),
        new THREE.Quaternion(),
        new THREE.Vector3(along === 'x' ? 0.55 : T * 0.95, 0.5, along === 'x' ? T * 0.95 : 0.55),
      );
      acc.get('trim', x, z).append(box, m, this.theme.wall.scale);
    }
    box.dispose();
  }

  private addArchColliders(x: number, y: number, d: Dir, ec: THREE.Vector3): void {
    const r = ARCH_OPENING / 2;
    const outer = r + ARCH_FRAME;
    const depth = 0.3;
    const c = y * this.maze.width + x;
    const n = neighbor(this.maze, c, d);
    for (const side of [-1, 1]) {
      const inner = side * r;
      const out = side * outer;
      const lo = Math.min(inner, out);
      const hi = Math.max(inner, out);
      const box =
        d === 0 || d === 2
          ? { minX: ec.x + lo, maxX: ec.x + hi, minZ: ec.z - depth, maxZ: ec.z + depth }
          : { minX: ec.x - depth, maxX: ec.x + depth, minZ: ec.z + lo, maxZ: ec.z + hi };
      this.collision.addBox(c, box);
      this.collision.addBox(n, box);
    }
  }

  private registerDoorway(x: number, y: number, d: Dir, ec: THREE.Vector3): void {
    const c = y * this.maze.width + x;
    const n = neighbor(this.maze, c, d);
    const out = new THREE.Vector3(DX[d], 0, DY[d]);
    // Glow/rune meshes are created lazily in buildDoorwayMarkers (only where creatures stand).
    this.doorways.set(`${c}:${d}`, { center: ec.clone(), outward: out, glow: null as never, runes: null as never });
    this.doorways.set(`${n}:${opposite(d)}`, { center: ec.clone(), outward: out.clone().negate(), glow: null as never, runes: null as never });
  }

  /** Glowing arch outlines + floor rune circles for every doorway a creature may reveal. */
  private buildDoorwayMarkers(): void {
    const r = ARCH_OPENING / 2 - 0.04;
    const spring = Math.min(2.3, this.H - 1.85);
    const path = new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(new THREE.Vector3(-r, 0.02, 0), new THREE.Vector3(-r, spring, 0)));
    path.add(
      new THREE.CatmullRomCurve3(
        Array.from({ length: 13 }, (_, i) => {
          const a = Math.PI - (i / 12) * Math.PI;
          return new THREE.Vector3(Math.cos(a) * r, spring + Math.sin(a) * r, 0);
        }),
      ),
    );
    path.add(new THREE.LineCurve3(new THREE.Vector3(r, spring, 0), new THREE.Vector3(r, 0.02, 0)));
    const tube = new THREE.TubeGeometry(path, 64, 0.055, 6, false);
    const runePlane = new THREE.PlaneGeometry(2.4, 2.4);
    runePlane.rotateX(-Math.PI / 2);
    this.disposables.push(tube, runePlane);
    const runeTex = runeCircleTexture();
    for (const e of this.maze.encounters) {
      const key = `${e.cell}:${e.correctDir}`;
      let dw = this.doorways.get(key);
      if (!dw) {
        // Every junction exit has an arch, but guard anyway.
        const { x, y } = cellXY(this.maze, e.cell);
        dw = { center: edgeCenter(x, y, e.correctDir), outward: new THREE.Vector3(DX[e.correctDir], 0, DY[e.correctDir]), glow: null as never, runes: null as never };
        this.doorways.set(key, dw);
      }
      const glowMat = new THREE.MeshBasicMaterial({
        color: this.theme.runeColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(tube, glowMat);
      glow.position.copy(dw.center).addScaledVector(dw.outward, -0.3);
      glow.rotation.y = Math.abs(dw.outward.x) > 0.5 ? Math.PI / 2 : 0;
      glow.visible = false;
      const runeMat = new THREE.MeshBasicMaterial({
        map: runeTex,
        color: this.theme.runeColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const runes = new THREE.Mesh(runePlane, runeMat);
      runes.position.copy(dw.center).addScaledVector(dw.outward, 1.25);
      runes.position.y = 0.03;
      runes.visible = false;
      this.group.add(glow, runes);
      this.disposables.push(glowMat, runeMat);
      dw.glow = glow;
      dw.runes = runes;
    }
  }

  // ── Lights & fixtures ────────────────────────────────────────────────────────────────

  private buildFixtures(): void {
    const { maze, theme } = this;
    const acc = new ChunkedAccumulator(C * 6);
    const rng = this.rng.fork('lights');
    const every = theme.light.every;
    const lit: number[] = [];
    const tooClose = (c: number, min: number): boolean => {
      const a = cellXY(maze, c);
      return lit.some((o) => {
        const b = cellXY(maze, o);
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < min;
      });
    };
    // Staged encounters bring their own lighting (see decor.ts), so fixtures keep out of the shot.
    const staged = new Set(this.pbr ? maze.encounters.map((e) => e.cell) : []);
    const must = new Set<number>([maze.start, ...maze.encounters.map((e) => e.cell), ...maze.specials.map((s) => s.cell)].filter((c) => !staged.has(c)));
    const order = [...must, ...rng.shuffle(Array.from({ length: maze.width * maze.height }, (_, i) => i).filter((c) => !must.has(c)))];
    for (const c of order) {
      if ((maze.room[c] as number) >= 0 || staged.has(c)) continue;
      if (!must.has(c) && tooClose(c, Math.max(2, Math.round(every * 0.75)))) continue;
      if (!must.has(c) && !rng.chance(0.85)) continue;
      const closed = DIRS.filter((d) => !isOpen(maze, c, d) && !(c === maze.start && d === maze.startDir) && !(c === maze.exit && d === maze.exitDir));
      if (closed.length === 0) continue;
      const d = rng.pick(closed);
      // In creature/special cells the creature stands at the middle of the wall: light the corner.
      const corner = maze.encounters.some((e) => e.cell === c) || maze.specials.some((s) => s.cell === c) ? (rng.chance(0.5) ? 1.3 : -1.3) : 0;
      this.placeFixture(acc, c, d, rng, corner);
      lit.push(c);
    }
    for (const [key, a] of acc.entries()) {
      const geo = a.build();
      const mat = (this.materials as unknown as Record<string, THREE.Material>)[key] ?? this.materials.metal;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
    this.torchLights = new TorchLights(this.lightSpots, this.quality.maxTorchLights);
    this.group.add(this.torchLights.group);
    this.disposables.push(this.torchLights);
  }

  private placeFixture(acc: ChunkedAccumulator, c: number, d: Dir, rng: Rng, corner: number): void {
    const { theme } = this;
    const { x, y } = cellXY(this.maze, c);
    const center = new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2);
    const toWall = new THREE.Vector3(DX[d], 0, DY[d]);
    const tangent = new THREE.Vector3(-toWall.z, 0, toWall.x);
    const wallFace = center.clone().addScaledVector(toWall, C / 2 - T / 2).addScaledVector(tangent, corner);
    const along = (a: number, b: number): number => (corner !== 0 ? 0 : rng.range(a, b));
    const yaw = Math.atan2(-toWall.x, -toWall.z);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const add = (key: string, geo: THREE.BufferGeometry, pos: THREE.Vector3, rot?: THREE.Quaternion, scale?: THREE.Vector3): void => {
      m.compose(pos, rot ?? q, scale ?? new THREE.Vector3(1, 1, 1));
      acc.get(key, pos.x, pos.z).append(geo, m);
    };
    const color = new THREE.Color(theme.light.color);
    const kind = theme.light.kind;
    const spot = (pos: THREE.Vector3, intensity: number, distance: number, flicker: number): void => {
      this.lightSpots.push({ position: pos, color: theme.light.color, intensity, distance, flicker });
    };
    if (kind === 'torch') {
      const base = wallFace.clone().addScaledVector(toWall, -0.08);
      base.y = 2.25;
      add('metal', new THREE.BoxGeometry(0.16, 0.34, 0.08), base);
      const tilt = new THREE.Quaternion().setFromAxisAngle(tangent, -0.38).multiply(q);
      const stick = base.clone().addScaledVector(toWall, -0.16);
      stick.y = 2.38;
      add('wood', new THREE.CylinderGeometry(0.045, 0.035, 0.6, 7), stick, tilt);
      const cup = base.clone().addScaledVector(toWall, -0.27);
      cup.y = 2.66;
      add('metal', new THREE.CylinderGeometry(0.11, 0.07, 0.14, 8), cup, tilt);
      const flame = cup.clone();
      flame.y += 0.2;
      this.flameSpecs.push({ position: flame, size: 0.62, color });
      spot(flame.clone().addScaledVector(toWall, -0.25), theme.light.intensity, 11, 0.18);
    } else if (kind === 'brazier') {
      const pos = wallFace.clone().addScaledVector(toWall, -0.75).addScaledVector(tangent, along(-0.9, 0.9));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22));
        add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.84, 5), leg, new THREE.Quaternion());
      }
      const bowl = pos.clone();
      bowl.y = 0.92;
      add('metal', new THREE.CylinderGeometry(0.42, 0.24, 0.26, 12), bowl, new THREE.Quaternion());
      const coals = pos.clone();
      coals.y = 1.05;
      add('glow', new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12), coals, new THREE.Quaternion());
      const flame = pos.clone();
      flame.y = 1.38;
      this.flameSpecs.push({ position: flame, size: 1.05, color });
      spot(flame.clone().setY(1.6), theme.light.intensity, 12, 0.22);
      this.collision.addCircle(c, { x: pos.x, z: pos.z, r: 0.45 });
    } else if (kind === 'lantern') {
      const pos = wallFace.clone().addScaledVector(toWall, -0.45).addScaledVector(tangent, along(-1, 1));
      add('wood', new THREE.CylinderGeometry(0.07, 0.1, 2.5, 7), pos.clone().setY(1.25), new THREE.Quaternion());
      const armPos = pos.clone().addScaledVector(toWall, -0.25).setY(2.42);
      add('wood', new THREE.BoxGeometry(0.07, 0.07, 0.6), armPos);
      const lanternPos = pos.clone().addScaledVector(toWall, -0.5).setY(2.1);
      add('metal', new THREE.ConeGeometry(0.2, 0.16, 4), lanternPos.clone().setY(2.33), new THREE.Quaternion());
      add('glow', new THREE.BoxGeometry(0.22, 0.32, 0.22), lanternPos, new THREE.Quaternion());
      this.flameSpecs.push({ position: lanternPos, size: 0.28, color });
      spot(lanternPos.clone(), theme.light.intensity, 10, 0.08);
      this.collision.addCircle(c, { x: pos.x, z: pos.z, r: 0.22 });
    } else if (kind === 'crystal') {
      const pos = wallFace.clone().addScaledVector(toWall, -0.5).addScaledVector(tangent, along(-1, 1));
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const h = rng.range(0.6, 1.8);
        const p = pos.clone().add(new THREE.Vector3(rng.range(-0.3, 0.3), h / 2, rng.range(-0.3, 0.3)));
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.35, 0.35), rng.range(0, 6), rng.range(-0.35, 0.35)));
        add('crystal', new THREE.OctahedronGeometry(0.5, 0), p, tilt, new THREE.Vector3(0.28, h, 0.28));
      }
      spot(pos.clone().setY(1.3).addScaledVector(toWall, -0.4), theme.light.intensity, 10, 0.05);
      this.collision.addCircle(c, { x: pos.x, z: pos.z, r: 0.45 });
    } else {
      // Giant glowing mushroom.
      const pos = wallFace.clone().addScaledVector(toWall, -0.55).addScaledVector(tangent, along(-1, 1));
      const h = rng.range(1.1, 1.6);
      add('stone', new THREE.CylinderGeometry(0.1, 0.16, h, 8), pos.clone().setY(h / 2), new THREE.Quaternion());
      const cap = new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      add('glow', cap, pos.clone().setY(h - 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 0.55, 1));
      spot(pos.clone().setY(h - 0.25).addScaledVector(toWall, -0.3), theme.light.intensity, 10, 0.06);
      this.collision.addCircle(c, { x: pos.x, z: pos.z, r: 0.35 });
    }
  }

  // ── Chambers ─────────────────────────────────────────────────────────────────────────

  private buildRooms(): void {
    const { maze, theme } = this;
    const acc = new ChunkedAccumulator(C * 6);
    const m = new THREE.Matrix4();
    const add = (key: string, geo: THREE.BufferGeometry, pos: THREE.Vector3, scale = new THREE.Vector3(1, 1, 1), rot = new THREE.Quaternion()): void => {
      m.compose(pos, rot, scale);
      acc.get(key, pos.x, pos.z).append(geo, m, key === 'trim' || key === 'stone' ? theme.wall.scale : undefined);
      geo.dispose();
    };
    for (const room of maze.rooms) {
      const cx = (room.x + room.w / 2) * C;
      const cz = (room.y + room.h / 2) * C;
      const center = new THREE.Vector3(cx, 0, cz);
      const centerCell = Math.min(maze.width * maze.height - 1, Math.floor(cz / C) * maze.width + Math.floor(cx / C));
      // Pedestal.
      add('trim', new THREE.CylinderGeometry(1.0, 1.15, 0.5, 16), center.clone().setY(0.25));
      add('trim', new THREE.CylinderGeometry(0.85, 0.95, 0.25, 16), center.clone().setY(0.62));
      if (theme.light.kind === 'crystal' || theme.id === 'mystic') {
        // Giant crystal / floating orb.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const h = i === 0 ? 3.2 : 1.6 + (i % 2) * 0.6;
          const p = i === 0 ? center.clone().setY(0.75 + h / 2) : center.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.75 + h / 2, Math.sin(a) * 0.5));
          const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(i === 0 ? 0 : Math.cos(a) * 0.4, a, i === 0 ? 0 : Math.sin(a) * 0.4));
          add('crystal', new THREE.OctahedronGeometry(0.5, 0), p, new THREE.Vector3(i === 0 ? 0.7 : 0.4, h, i === 0 ? 0.7 : 0.4), tilt);
        }
        this.lightSpots.push({ position: center.clone().setY(2.6), color: theme.runeColor, intensity: 22, distance: 16, flicker: 0.04 });
      } else if (theme.light.kind === 'brazier' || theme.id === 'volcanic') {
        add('metal', new THREE.CylinderGeometry(0.75, 0.45, 0.45, 16), center.clone().setY(1.0));
        add('glow', new THREE.CylinderGeometry(0.66, 0.66, 0.05, 16), center.clone().setY(1.2));
        this.flameSpecs.push({ position: center.clone().setY(1.7), size: 2.2, color: new THREE.Color(theme.light.color) });
        this.lightSpots.push({ position: center.clone().setY(2.2), color: theme.light.color, intensity: 30, distance: 18, flicker: 0.25 });
      } else {
        // Guardian statue: a robed figure holding a sphere.
        add('stone', new THREE.CylinderGeometry(0.35, 0.6, 1.9, 10), center.clone().setY(1.7));
        add('stone', new THREE.SphereGeometry(0.28, 12, 10), center.clone().setY(2.9));
        add('stone', new THREE.ConeGeometry(0.42, 0.55, 10), center.clone().setY(3.28));
        add('stone', new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), center.clone().add(new THREE.Vector3(0.42, 2.25, 0)), new THREE.Vector3(1, 1, 1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.6));
        add('crystal', new THREE.SphereGeometry(0.2, 12, 10), center.clone().add(new THREE.Vector3(0.85, 2.85, 0)));
        this.lightSpots.push({ position: center.clone().add(new THREE.Vector3(0.85, 2.9, 0)), color: theme.runeColor, intensity: 12, distance: 12, flicker: 0.05 });
        if (theme.light.kind === 'torch' || theme.light.kind === 'lantern') {
          // Four standing braziers around the statue.
          for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
            const p = center.clone().add(new THREE.Vector3(Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3));
            if (room.w < 3 && room.h < 3) continue;
            add('metal', new THREE.CylinderGeometry(0.05, 0.08, 1.3, 6), p.clone().setY(0.65));
            add('metal', new THREE.CylinderGeometry(0.2, 0.1, 0.16, 8), p.clone().setY(1.35));
            this.flameSpecs.push({ position: p.clone().setY(1.6), size: 0.7, color: new THREE.Color(theme.light.color) });
          }
        }
      }
      this.collision.addCircle(centerCell, { x: cx, z: cz, r: 1.15 });
    }
    for (const [key, a] of acc.entries()) {
      const geo = a.build();
      const mat = (this.materials as unknown as Record<string, THREE.Material>)[key] ?? this.materials.stone;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
  }

  // ── Entrance & exit ──────────────────────────────────────────────────────────────────

  private buildGate(): void {
    const { maze } = this;
    const { x, y } = cellXY(maze, maze.start);
    const d = maze.startDir;
    const ec = edgeCenter(x, y, d);
    const inward = new THREE.Vector3(-DX[d], 0, -DY[d]);
    const g = new THREE.Group();
    // Sit in front of the (displaced) wall surface.
    g.position.copy(ec).addScaledVector(inward, T / 2 + 0.1);
    g.rotation.y = Math.atan2(inward.x, inward.z);
    const spring = Math.min(2.3, this.H - 1.85);
    const arch = new THREE.Mesh(archGeometry(ARCH_OPENING, spring, ARCH_FRAME + 0.05, 0.4), this.materials.trim);
    arch.position.z = 0.2;
    const recessShape = new THREE.Shape();
    const r = ARCH_OPENING / 2;
    recessShape.moveTo(-r, 0);
    recessShape.lineTo(-r, spring);
    recessShape.absarc(0, spring, r, Math.PI, 0, true);
    recessShape.lineTo(r, 0);
    const recess = new THREE.Mesh(new THREE.ShapeGeometry(recessShape, 12), new THREE.MeshBasicMaterial({ color: 0x050407 }));
    recess.position.z = 0.01;
    const bars = new THREE.Group();
    bars.position.z = 0.08;
    const barGeo = new THREE.CylinderGeometry(0.035, 0.035, spring + r, 6);
    // Raised bars are clipped at the arch apex so they never poke out above the gateway.
    const barMat = this.materials.metal.clone();
    barMat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), spring + r)];
    this.disposables.push(barMat);
    for (let i = -6; i <= 6; i++) {
      const b = new THREE.Mesh(barGeo, barMat);
      b.position.set((i / 6) * (r - 0.1), (spring + r) / 2, 0);
      bars.add(b);
    }
    for (let k = 1; k <= 3; k++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.06, 0.06), barMat);
      cross.position.y = (k / 4) * (spring + r);
      bars.add(cross);
    }
    g.add(arch, recess, bars);
    this.group.add(g);
    this.gate = {
      setClosed(amount: number) {
        bars.position.y = (1 - amount) * (spring + r - 0.2);
        bars.visible = amount > 0.02;
      },
    };
    this.gate.setClosed(0);
  }

  private buildExit(): void {
    const { maze } = this;
    const { x, y } = cellXY(maze, maze.exit);
    const d = maze.exitDir;
    const ec = edgeCenter(x, y, d);
    const inward = new THREE.Vector3(-DX[d], 0, -DY[d]);
    const g = new THREE.Group();
    g.position.copy(ec).addScaledVector(inward, T / 2 + 0.1);
    g.rotation.y = Math.atan2(inward.x, inward.z);
    const spring = Math.min(2.5, this.H - 1.7);
    const opening = ARCH_OPENING - 0.2;
    const r = opening / 2;
    const frame = new THREE.Mesh(archGeometry(opening, spring, 0.42, 0.5), this.materials.gold);
    frame.position.z = 0.12;
    // Glowing veil (visible once the doors open).
    const veilShape = new THREE.Shape();
    veilShape.moveTo(-r, 0);
    veilShape.lineTo(-r, spring);
    veilShape.absarc(0, spring, r, Math.PI, 0, true);
    veilShape.lineTo(r, 0);
    const veilGeo = new THREE.ShapeGeometry(veilShape, 16);
    const uv = veilGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + r) / (2 * r), uv.getY(i) / (spring + r));
    const veilMat = new THREE.MeshBasicMaterial({ map: portalTexture(), color: 0xfff1c8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const veil = new THREE.Mesh(veilGeo, veilMat);
    veil.position.z = 0.04;
    const back = new THREE.Mesh(new THREE.ShapeGeometry(veilShape, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }));
    back.position.z = 0.01;
    // Doors.
    const doorMat = this.materials.wood;
    const makeDoor = (side: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(side * r, 0, 0.16);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(r, spring + r * 0.6, 0.12), doorMat);
      panel.position.set(-side * (r / 2), (spring + r * 0.6) / 2, 0);
      pivot.add(panel);
      for (const hy of [0.6, spring - 0.2]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(r * 0.96, 0.1, 0.14), this.materials.metal);
        band.position.set(-side * (r / 2), hy, 0.01);
        pivot.add(band);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), this.materials.gold);
      ring.position.set(-side * (r - 0.25), 1.2, 0.08);
      pivot.add(ring);
      return pivot;
    };
    const left = makeDoor(-1);
    const right = makeDoor(1);
    // Light leaking through the gap between the closed doors.
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.05, spring + r * 0.55), new THREE.MeshBasicMaterial({ color: 0xffe6a8, fog: false }));
    crack.position.set(0, (spring + r * 0.55) / 2, 0.235);
    g.add(frame, back, veil, left, right, crack);
    const light = new THREE.PointLight(0xffd690, 16, 14, 2);
    light.position.set(0, 2.2, 1.2);
    g.add(light);
    // A beam of light rising above the walls (visible across open-sky labyrinths).
    if (this.theme.openSky) {
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 40, 16, 1, true), beamMat);
      beam.position.set(0, 20, 1.2);
      g.add(beam);
      this.animators.push((_, t) => {
        beamMat.opacity = 0.12 + Math.sin(t * 1.3) * 0.04;
      });
    }
    this.group.add(g);
    const position = ec.clone().addScaledVector(inward, T / 2);
    const exit: ExitPortal = {
      position,
      inward,
      open: 0,
      light,
      update(dt, time, playerDist) {
        const target = playerDist < 5.5 ? 1 : 0;
        exit.open += (target - exit.open) * Math.min(1, dt * (target > exit.open ? 0.9 : 1.5));
        const a = exit.open * 1.05;
        left.rotation.y = -a;
        right.rotation.y = a;
        veilMat.opacity = 0.25 + exit.open * 0.75 + Math.sin(time * 2) * 0.05;
        crack.visible = exit.open < 0.05;
        light.intensity = 16 + exit.open * 12 + Math.sin(time * 3) * 1.5;
      },
    };
    this.exit = exit;
  }

  // ── Atmosphere ───────────────────────────────────────────────────────────────────────

  private buildAtmosphere(): void {
    const { theme, quality } = this;
    this.flames = new Flames(this.flameSpecs);
    this.group.add(this.flames.group);
    this.disposables.push(this.flames);
    this.particles = new AmbientParticles(theme.particles, quality.particleScale);
    this.group.add(this.particles.points);
    this.disposables.push(this.particles);
    if (this.themeB && this.themeB.particles !== theme.particles) {
      this.particlesB = new AmbientParticles(this.themeB.particles, quality.particleScale);
      this.particlesB.setStrength(0);
      this.group.add(this.particlesB.points);
      this.disposables.push(this.particlesB);
    }
    if (this.pbr && (theme.id === 'forest' || this.themeB?.id === 'forest')) {
      this.leaves = new AmbientParticles('leaves', quality.particleScale);
      this.leaves.setStrength(theme.id === 'forest' ? 1 : 0);
      this.group.add(this.leaves.points);
      this.disposables.push(this.leaves);
    }
    // Smoke columns over every real fire (braziers, fire pits, fire bowls).
    const fires = this.flameSpecs.filter((f) => f.size >= 0.5);
    if (this.pbr && fires.length > 0 && quality.particleScale >= 0.7) {
      this.smoke = new Smoke(fires, quality.particleScale);
      this.group.add(this.smoke.points);
      this.disposables.push(this.smoke);
    }
    const center = new THREE.Vector3((this.maze.width * C) / 2, 0, (this.maze.height * C) / 2);
    this.sky = createSky(theme, center);
    this.group.add(this.sky.group);
    if (theme.openSky && theme.moonIntensity > 0) {
      const moon = new THREE.DirectionalLight(theme.moonLight, theme.moonIntensity);
      moon.position.copy(this.sky.moonDir).multiplyScalar(40);
      moon.castShadow = quality.shadows;
      if (quality.shadows) {
        moon.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
        const s = moon.shadow.camera;
        s.left = -22;
        s.right = 22;
        s.top = 22;
        s.bottom = -22;
        s.near = 1;
        s.far = 90;
        moon.shadow.bias = -0.0008;
        moon.shadow.normalBias = 0.04;
      }
      this.group.add(moon, moon.target);
      this.moonLight = moon;
    }
  }

  update(dt: number, time: number, camera: THREE.Camera, viewportHeight: number): void {
    const camPos = camera.position;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    this.torchLights.update(dt, time, camPos, camDir);
    this.flames.update(time, viewportHeight);
    this.particles.update(time, camPos, viewportHeight);
    this.particlesB?.update(time, camPos, viewportHeight);
    this.leaves?.update(time, camPos, viewportHeight);
    this.smoke?.update(time, viewportHeight);
    this.sky.update(time, camPos);
    this.props.update(time);
    this.decor?.update(time);
    for (const a of this.animators) a(dt, time);
    this.exit.update(dt, time, Math.hypot(camPos.x - this.exit.position.x, camPos.z - this.exit.position.z));
    if (this.moonLight) {
      // Keep the shadow frustum centred on the player.
      this.moonLight.target.position.set(camPos.x, 0, camPos.z);
      this.moonLight.position.copy(this.sky.moonDir).multiplyScalar(40).add(this.moonLight.target.position);
    }
  }

  /** Blends sky light toward the second biome as the player crosses over (k = 0..1). */
  setBiomeBlend(k: number): void {
    const a = this.theme;
    const b = this.themeB;
    if (!b) return;
    this.hemi.color.setHex(a.hemiSky).lerp(tmpColor.setHex(b.hemiSky), k);
    this.hemi.groundColor.setHex(a.hemiGround).lerp(tmpColor.setHex(b.hemiGround), k);
    this.hemi.intensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k;
    if (this.particlesB) {
      this.particles.setStrength(1 - k);
      this.particlesB.setStrength(k);
    }
    this.leaves?.setStrength(a.id === 'forest' ? 1 - k : k);
    if (this.moonLight) {
      this.moonLight.color.setHex(a.moonLight).lerp(tmpColor.setHex(b.moonLight), k);
      this.moonLight.intensity = a.moonIntensity + ((b.openSky ? b.moonIntensity : 0) - a.moonIntensity) * k;
    }
  }

  /** World-space centre of a cell at floor level. */
  cellCenter(c: number): THREE.Vector3 {
    const { x, y } = cellXY(this.maze, c);
    return new THREE.Vector3(x * C + C / 2, 0, y * C + C / 2);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.materials.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    this.group.clear();
  }
}

export { rockGeometry };
