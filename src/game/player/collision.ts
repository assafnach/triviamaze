import { GAME_CONFIG } from '@/config/gameConfig';
import { isOpen } from '../maze/grid';
import { DIRS, type Maze } from '../maze/types';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
  /** Dynamic colliders (creatures) can be toggled. */
  active?: boolean;
}

const C = GAME_CONFIG.world.cellSize;
const T = GAME_CONFIG.world.wallThickness;

/** Spatially indexed static + dynamic colliders for the labyrinth. */
export class CollisionWorld {
  private readonly boxes: AABB[][];
  private readonly circles: Circle[][];
  readonly width: number;
  readonly height: number;

  constructor(maze: Maze) {
    this.width = maze.width;
    this.height = maze.height;
    const n = maze.width * maze.height;
    this.boxes = Array.from({ length: n }, () => []);
    this.circles = Array.from({ length: n }, () => []);
    for (let c = 0; c < n; c++) {
      const x = c % maze.width;
      const y = Math.floor(c / maze.width);
      for (const d of DIRS) {
        if (isOpen(maze, c, d)) continue;
        this.boxes[c]!.push(wallBox(x, y, d));
      }
    }
  }

  addBox(cell: number, box: AABB): void {
    this.boxes[cell]?.push(box);
  }

  addCircle(cell: number, circle: Circle): Circle {
    this.circles[cell]?.push(circle);
    return circle;
  }

  private nearby(x: number, z: number, out: { boxes: AABB[]; circles: Circle[] }): void {
    out.boxes.length = 0;
    out.circles.length = 0;
    const cx = Math.floor(x / C);
    const cz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= this.width || gz >= this.height) continue;
        const i = gz * this.width + gx;
        for (const b of this.boxes[i]!) out.boxes.push(b);
        for (const c of this.circles[i]!) if (c.active !== false) out.circles.push(c);
      }
    }
  }

  private readonly scratch = { boxes: [] as AABB[], circles: [] as Circle[] };

  /**
   * Moves a circle from (x, z) by (dx, dz), sliding along walls.
   * Sub-steps so fast motion never tunnels through thin geometry.
   */
  move(x: number, z: number, dx: number, dz: number, radius: number): { x: number; z: number } {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
    let px = x;
    let pz = z;
    for (let s = 0; s < steps; s++) {
      px += dx / steps;
      pz += dz / steps;
      const r = this.resolve(px, pz, radius);
      px = r.x;
      pz = r.z;
    }
    // Hard clamp inside the labyrinth bounds.
    px = Math.min(this.width * C - T / 2 - radius, Math.max(T / 2 + radius, px));
    pz = Math.min(this.height * C - T / 2 - radius, Math.max(T / 2 + radius, pz));
    return { x: px, z: pz };
  }

  resolve(x: number, z: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 3; iter++) {
      this.nearby(px, pz, this.scratch);
      let moved = false;
      for (const b of this.scratch.boxes) {
        const qx = Math.max(b.minX, Math.min(px, b.maxX));
        const qz = Math.max(b.minZ, Math.min(pz, b.maxZ));
        let ox = px - qx;
        let oz = pz - qz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= radius * radius) continue;
        if (d2 < 1e-10) {
          // Centre is inside the box: push out along the shallowest axis.
          const left = px - b.minX;
          const right = b.maxX - px;
          const top = pz - b.minZ;
          const bottom = b.maxZ - pz;
          const m = Math.min(left, right, top, bottom);
          if (m === left) px = b.minX - radius;
          else if (m === right) px = b.maxX + radius;
          else if (m === top) pz = b.minZ - radius;
          else pz = b.maxZ + radius;
        } else {
          const d = Math.sqrt(d2);
          ox /= d;
          oz /= d;
          px = qx + ox * radius;
          pz = qz + oz * radius;
        }
        moved = true;
      }
      for (const c of this.scratch.circles) {
        const ox = px - c.x;
        const oz = pz - c.z;
        const min = radius + c.r;
        const d2 = ox * ox + oz * oz;
        if (d2 >= min * min || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        px = c.x + (ox / d) * min;
        pz = c.z + (oz / d) * min;
        moved = true;
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  /** True if a point is free (used by tests and debug visualisation). */
  isFree(x: number, z: number, radius: number): boolean {
    const r = this.resolve(x, z, radius);
    return Math.abs(r.x - x) < 1e-6 && Math.abs(r.z - z) < 1e-6;
  }

  allBoxes(): AABB[] {
    return this.boxes.flat();
  }
}

/** Axis-aligned box for the closed side `d` of cell (x, y), including the corner posts. */
export function wallBox(x: number, y: number, d: number): AABB {
  const x0 = x * C;
  const z0 = y * C;
  switch (d) {
    case 0:
      return { minX: x0 - T / 2, maxX: x0 + C + T / 2, minZ: z0 - T / 2, maxZ: z0 + T / 2 };
    case 2:
      return { minX: x0 - T / 2, maxX: x0 + C + T / 2, minZ: z0 + C - T / 2, maxZ: z0 + C + T / 2 };
    case 1:
      return { minX: x0 + C - T / 2, maxX: x0 + C + T / 2, minZ: z0 - T / 2, maxZ: z0 + C + T / 2 };
    default:
      return { minX: x0 - T / 2, maxX: x0 + T / 2, minZ: z0 - T / 2, maxZ: z0 + C + T / 2 };
  }
}
