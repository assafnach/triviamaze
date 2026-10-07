import { MAZE_PROFILES, type MazeProfile } from '@/config/gameConfig';
import type { AgeGroup } from '@/types';
import { Rng } from '@/utils/rng';
import { bfs, degree, isOpen, neighbor, openDirs } from './grid';
import { DIRS, DX, DY, bit, opposite, type Dir, type EncounterSite, type Maze, type Room, type SpecialSite } from './types';
import { validateMaze } from './validate';

const MAX_ATTEMPTS = 40;

/**
 * Generates a solvable, validated labyrinth. Deterministic for a given seed and age group:
 * if an attempt fails validation, the next attempt uses a derived seed, so the result is reproducible.
 */
export function generateMaze(seed: number, ageGroup: AgeGroup): Maze {
  const profile = MAZE_PROFILES[ageGroup];
  let lastReasons: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const maze = buildCandidate((seed + attempt * 7919) >>> 0, profile);
    const result = validateMaze(maze, profile);
    if (result.ok) return maze;
    lastReasons = result.reasons;
  }
  throw new Error(`Failed to generate a valid maze for seed ${seed}: ${lastReasons.join(', ')}`);
}

export function buildCandidate(seed: number, profile: MazeProfile): Maze {
  const rng = new Rng(seed);
  const width = rng.int(profile.size[0], profile.size[1]);
  const height = rng.int(profile.size[0], profile.size[1]);
  const n = width * height;
  const open = new Uint8Array(n);
  const room = new Int16Array(n).fill(-1);

  carveGrowingTree(rng, width, height, open, profile.corridorBias);

  const maze: Maze = {
    seed,
    width,
    height,
    open,
    room,
    rooms: [],
    start: 0,
    startDir: 3,
    exit: 0,
    exitDir: 1,
    distToExit: new Int32Array(n),
    distFromStart: new Int32Array(n),
    solution: [],
    junctions: [],
    deadEnds: [],
    encounters: [],
    treasures: [],
    specials: [],
    checkpointCells: [],
  };

  chooseStartAndExit(rng, maze);
  carveRooms(rng, maze, profile.rooms);
  braid(rng, maze, profile.braid);
  analyse(maze);
  placeEncounters(rng, maze, profile.encounters);
  placeTreasuresAndSpecials(rng, maze, profile.treasures);
  placeCheckpoints(maze);
  return maze;
}

/** Growing-tree: blends recursive backtracking (long corridors) and Prim-like branching. */
function carveGrowingTree(rng: Rng, w: number, h: number, open: Uint8Array, corridorBias: number): void {
  const visited = new Uint8Array(w * h);
  const startIdx = rng.int(0, w * h - 1);
  const active: number[] = [startIdx];
  visited[startIdx] = 1;
  while (active.length > 0) {
    const pickNewest = rng.chance(corridorBias);
    const ai = pickNewest ? active.length - 1 : rng.int(0, active.length - 1);
    const c = active[ai] as number;
    const cx = c % w;
    const cy = Math.floor(c / w);
    const options: Dir[] = [];
    for (const d of DIRS) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!visited[ny * w + nx]) options.push(d);
    }
    if (options.length === 0) {
      active.splice(ai, 1);
      continue;
    }
    const d = rng.pick(options);
    const ni = (cy + DY[d]) * w + (cx + DX[d]);
    open[c] = (open[c] as number) | bit(d);
    open[ni] = (open[ni] as number) | bit(opposite(d));
    visited[ni] = 1;
    active.push(ni);
  }
}

function boundaryDirs(maze: Maze, c: number): Dir[] {
  const x = c % maze.width;
  const y = Math.floor(c / maze.width);
  const out: Dir[] = [];
  if (y === 0) out.push(0);
  if (x === maze.width - 1) out.push(1);
  if (y === maze.height - 1) out.push(2);
  if (x === 0) out.push(3);
  return out;
}

function chooseStartAndExit(rng: Rng, maze: Maze): void {
  const { width: w, height: h } = maze;
  // Entrance: a boundary cell on a random side (not a corner, so the gate has room).
  const side = rng.int(0, 3) as Dir;
  let sx: number;
  let sy: number;
  if (side === 0 || side === 2) {
    sx = rng.int(1, w - 2);
    sy = side === 0 ? 0 : h - 1;
  } else {
    sy = rng.int(1, h - 2);
    sx = side === 3 ? 0 : w - 1;
  }
  maze.start = sy * w + sx;
  maze.startDir = side;

  // Exit: one of the farthest boundary cells on another side.
  const dist = bfs(maze, maze.start);
  const candidates: number[] = [];
  for (let c = 0; c < w * h; c++) {
    const dirs = boundaryDirs(maze, c).filter((d) => d !== side);
    if (dirs.length === 0) continue;
    candidates.push(c);
  }
  candidates.sort((a, b) => (dist[b] as number) - (dist[a] as number));
  const top = candidates.slice(0, Math.max(3, Math.floor(candidates.length * 0.08)));
  maze.exit = rng.pick(top);
  const exitDirs = boundaryDirs(maze, maze.exit).filter((d) => d !== side);
  maze.exitDir = rng.pick(exitDirs);
}

function carveRooms(rng: Rng, maze: Maze, count: number): void {
  const { width: w, height: h } = maze;
  const forbidden = new Set<number>();
  for (const c of [maze.start, maze.exit]) {
    const cx = c % w;
    const cy = Math.floor(c / w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) forbidden.add(y * w + x);
      }
  }
  let tries = 0;
  while (maze.rooms.length < count && tries++ < 200) {
    const rw = rng.int(2, 3);
    const rh = rw === 3 ? 2 : rng.int(2, 3);
    const rx = rng.int(1, w - rw - 1);
    const ry = rng.int(1, h - rh - 1);
    if (rx < 1 || ry < 1) continue;
    let ok = true;
    for (let y = ry - 1; y < ry + rh + 1 && ok; y++)
      for (let x = rx - 1; x < rx + rw + 1 && ok; x++) {
        const c = y * w + x;
        if (forbidden.has(c) || (maze.room[c] as number) >= 0) ok = false;
      }
    if (!ok) continue;
    const id = maze.rooms.length;
    const r: Room = { id, x: rx, y: ry, w: rw, h: rh };
    maze.rooms.push(r);
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++) {
        const c = y * w + x;
        maze.room[c] = id;
        if (x < rx + rw - 1) {
          maze.open[c] = (maze.open[c] as number) | bit(1);
          maze.open[c + 1] = (maze.open[c + 1] as number) | bit(3);
        }
        if (y < ry + rh - 1) {
          maze.open[c] = (maze.open[c] as number) | bit(2);
          maze.open[c + w] = (maze.open[c + w] as number) | bit(0);
        }
      }
  }
}

/** Opens a fraction of dead ends into loops, creating alternative (usually longer) routes. */
function braid(rng: Rng, maze: Maze, fraction: number): void {
  const { width: w, height: h } = maze;
  for (let c = 0; c < w * h; c++) {
    if (c === maze.start || c === maze.exit) continue;
    if (degree(maze, c) !== 1 || !rng.chance(fraction)) continue;
    const x = c % w;
    const y = Math.floor(c / w);
    const closed = DIRS.filter((d) => {
      if (isOpen(maze, c, d)) return false;
      const nx = x + DX[d];
      const ny = y + DY[d];
      return nx >= 0 && ny >= 0 && nx < w && ny < h;
    });
    if (closed.length === 0) continue;
    // Prefer connecting two dead ends.
    const preferred = closed.filter((d) => degree(maze, neighbor(maze, c, d)) === 1);
    const d = rng.pick(preferred.length > 0 ? preferred : closed);
    const ni = neighbor(maze, c, d);
    maze.open[c] = (maze.open[c] as number) | bit(d);
    maze.open[ni] = (maze.open[ni] as number) | bit(opposite(d));
  }
}

export function analyse(maze: Maze): void {
  maze.distToExit = bfs(maze, maze.exit);
  maze.distFromStart = bfs(maze, maze.start);
  // Walk downhill from start toward exit (deterministic tie-break by direction order).
  const path: number[] = [maze.start];
  let c = maze.start;
  let guard = maze.width * maze.height;
  while (c !== maze.exit && guard-- > 0) {
    const d = (maze.distToExit[c] as number) - 1;
    const next = openDirs(maze, c)
      .map((dir) => neighbor(maze, c, dir))
      .find((nc) => maze.distToExit[nc] === d);
    if (next === undefined) break;
    path.push(next);
    c = next;
  }
  maze.solution = c === maze.exit ? path : [];
  maze.junctions = [];
  maze.deadEnds = [];
  for (let i = 0; i < maze.width * maze.height; i++) {
    const deg = degree(maze, i);
    if (deg >= 3 && (maze.room[i] as number) < 0) maze.junctions.push(i);
    if (deg === 1 && i !== maze.start && i !== maze.exit) maze.deadEnds.push(i);
  }
}

/** Direction from `c` that steps toward the exit along a shortest path. */
export function correctDirection(maze: Maze, c: number): Dir | null {
  const target = (maze.distToExit[c] as number) - 1;
  for (const d of openDirs(maze, c)) {
    if (maze.distToExit[neighbor(maze, c, d)] === target) return d;
  }
  return null;
}

/** Number of cells reachable from `from` without passing through `blocked` (capped). */
function branchReach(maze: Maze, from: number, blocked: number, cap: number): number {
  const seen = new Set<number>([blocked, from]);
  const queue = [from];
  let count = 0;
  while (queue.length > 0 && count < cap) {
    const c = queue.shift() as number;
    count++;
    for (const d of openDirs(maze, c)) {
      const n = neighbor(maze, c, d);
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return count;
}

/** A junction is meaningful when a wrong turn genuinely costs the player something. */
export function isMeaningfulJunction(maze: Maze, c: number): boolean {
  if (c === maze.start || c === maze.exit || (maze.room[c] as number) >= 0) return false;
  if (degree(maze, c) < 3) return false;
  const correct = correctDirection(maze, c);
  if (correct === null) return false;
  const here = maze.distToExit[c] as number;
  let costlyWrongTurns = 0;
  for (const d of openDirs(maze, c)) {
    if (d === correct) continue;
    const n = neighbor(maze, c, d);
    // A neighbour that is (almost) as good as the correct one would make the hint meaningless.
    if ((maze.distToExit[n] as number) <= here) return false;
    const backTowardStart = (maze.distFromStart[n] as number) < (maze.distFromStart[c] as number);
    if (backTowardStart) continue;
    if (branchReach(maze, n, c, 6) >= 2) costlyWrongTurns++;
  }
  return costlyWrongTurns >= 1;
}

function placeEncounters(rng: Rng, maze: Maze, target: number): void {
  const onPath = new Set(maze.solution);
  const candidates = maze.junctions.filter(
    (c) => isMeaningfulJunction(maze, c) && (maze.distFromStart[c] as number) >= 2,
  );
  const pathCandidates = rng.shuffle(candidates.filter((c) => onPath.has(c)));
  const offPathCandidates = rng.shuffle(candidates.filter((c) => !onPath.has(c)));
  const chosen: number[] = [];
  const minSpacing = 3;
  const farEnough = (c: number): boolean =>
    chosen.every((o) => {
      const dist = bfsDistance(maze, c, o, minSpacing);
      return dist >= minSpacing;
    });
  // Prefer the solution path (these are the decisions that truly matter), then
  // up to a third off-path to help players who have wandered.
  for (const c of pathCandidates) {
    if (chosen.length >= target) break;
    if (farEnough(c)) chosen.push(c);
  }
  const offPathQuota = Math.max(1, Math.floor(target / 3));
  let off = 0;
  for (const c of offPathCandidates) {
    if (chosen.length >= target || off >= offPathQuota) break;
    if (farEnough(c)) {
      chosen.push(c);
      off++;
    }
  }
  chosen.sort((a, b) => (maze.distFromStart[a] as number) - (maze.distFromStart[b] as number));
  maze.encounters = chosen.map(
    (cell, order): EncounterSite => ({
      cell,
      correctDir: correctDirection(maze, cell) as Dir,
      onSolutionPath: onPath.has(cell),
      order,
    }),
  );
}

function bfsDistance(maze: Maze, a: number, b: number, cap: number): number {
  if (a === b) return 0;
  const seen = new Map<number, number>([[a, 0]]);
  const queue = [a];
  while (queue.length > 0) {
    const c = queue.shift() as number;
    const d = seen.get(c) as number;
    if (d >= cap) continue;
    for (const dir of openDirs(maze, c)) {
      const n = neighbor(maze, c, dir);
      if (seen.has(n)) continue;
      if (n === b) return d + 1;
      seen.set(n, d + 1);
      queue.push(n);
    }
  }
  return cap;
}

function placeTreasuresAndSpecials(rng: Rng, maze: Maze, count: number): void {
  const reserved = new Set<number>([maze.start, maze.exit, ...maze.encounters.map((e) => e.cell)]);
  const onPath = new Set(maze.solution);
  // Specials live at the end of long side branches so exploring dead ends can pay off.
  const deepDeadEnds = maze.deadEnds.filter((c) => !reserved.has(c) && !onPath.has(c) && deadEndDepth(maze, c) >= 3);
  if (deepDeadEnds.length > 0 && rng.chance(0.65)) {
    const cell = rng.pick(deepDeadEnds);
    const facing = openDirs(maze, cell)[0] as Dir;
    const special: SpecialSite = { cell, kind: rng.chance(0.5) ? 'oracle' : 'merchant', facing };
    maze.specials.push(special);
    reserved.add(cell);
  }
  const deadEnds = rng.shuffle(maze.deadEnds.filter((c) => !reserved.has(c)));
  const corridors = rng.shuffle(
    Array.from({ length: maze.width * maze.height }, (_, i) => i).filter(
      (c) => !reserved.has(c) && degree(maze, c) === 2 && (maze.distFromStart[c] as number) > 1,
    ),
  );
  const treasureCount = Math.min(count, deadEnds.length + corridors.length);
  const fromDeadEnds = Math.min(deadEnds.length, Math.ceil(treasureCount * 0.65));
  maze.treasures = [...deadEnds.slice(0, fromDeadEnds), ...corridors.slice(0, treasureCount - fromDeadEnds)];
}

function deadEndDepth(maze: Maze, c: number): number {
  let depth = 0;
  let prev = -1;
  let cur = c;
  while (depth < 10) {
    const dirs = openDirs(maze, cur).map((d) => neighbor(maze, cur, d)).filter((n) => n !== prev);
    if (degree(maze, cur) > 2 || dirs.length !== 1) break;
    prev = cur;
    cur = dirs[0] as number;
    depth++;
  }
  return depth;
}

function placeCheckpoints(maze: Maze): void {
  const cells = new Set<number>();
  for (const r of maze.rooms) cells.add((r.y + Math.floor(r.h / 2)) * maze.width + r.x + Math.floor(r.w / 2));
  if (maze.solution.length > 6) cells.add(maze.solution[Math.floor(maze.solution.length / 2)] as number);
  maze.checkpointCells = [...cells];
}
