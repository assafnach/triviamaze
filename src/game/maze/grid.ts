import { GAME_CONFIG } from '@/config/gameConfig';
import { DIRS, DX, DY, bit, type Cell, type Dir, type Maze } from './types';

export const isOpen = (maze: Maze, c: number, d: Dir): boolean => ((maze.open[c] as number) & bit(d)) !== 0;

export const openDirs = (maze: Maze, c: number): Dir[] => DIRS.filter((d) => isOpen(maze, c, d));

export const degree = (maze: Maze, c: number): number => openDirs(maze, c).length;

export const neighbor = (maze: Maze, c: number, d: Dir): number => c + DX[d] + DY[d] * maze.width;

export const cellXY = (maze: Maze, c: number): Cell => ({ x: c % maze.width, y: Math.floor(c / maze.width) });

export const cellIndex = (maze: Maze, x: number, y: number): number => y * maze.width + x;

export function inBounds(maze: Maze, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
}

/** Breadth-first distances from `from`. Unreachable cells are -1. */
export function bfs(maze: Maze, from: number): Int32Array {
  const n = maze.width * maze.height;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const c = queue[head++] as number;
    const open = maze.open[c] as number;
    for (const d of DIRS) {
      if ((open & bit(d)) === 0) continue;
      const nc = c + DX[d] + DY[d] * maze.width;
      if (dist[nc] !== -1) continue;
      dist[nc] = (dist[c] as number) + 1;
      queue[tail++] = nc;
    }
  }
  return dist;
}

// ---- World-space helpers -------------------------------------------------------------

const C = GAME_CONFIG.world.cellSize;

export function cellCenter(maze: Maze, c: number): { x: number; z: number } {
  const { x, y } = cellXY(maze, c);
  return { x: x * C + C / 2, z: y * C + C / 2 };
}

export function worldToCell(maze: Maze, wx: number, wz: number): number {
  const x = Math.min(maze.width - 1, Math.max(0, Math.floor(wx / C)));
  const y = Math.min(maze.height - 1, Math.max(0, Math.floor(wz / C)));
  return y * maze.width + x;
}

/** Yaw (radians) for a camera/creature facing direction `d` (0 = looking toward -Z). */
export function dirToYaw(d: Dir): number {
  // three.js: yaw 0 looks down -Z (north). Positive yaw turns left (toward -X / west).
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][d] as number;
}

export function dirVector(d: Dir): { x: number; z: number } {
  return { x: DX[d], z: DY[d] };
}

/** Cells visible from `c` in straight lines down open corridors (for the magical map). */
export function visibleCells(maze: Maze, c: number, maxRange = 5): number[] {
  const out = [c];
  for (const d of DIRS) {
    let cur = c;
    for (let i = 0; i < maxRange && isOpen(maze, cur, d); i++) {
      cur = neighbor(maze, cur, d);
      out.push(cur);
    }
  }
  const roomId = maze.room[c] as number;
  if (roomId >= 0) {
    const r = maze.rooms[roomId];
    if (r) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(y * maze.width + x);
  }
  return out;
}
