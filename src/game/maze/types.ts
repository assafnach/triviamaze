/** Direction index: 0 = North (-Z), 1 = East (+X), 2 = South (+Z), 3 = West (-X). */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const bit = (d: Dir): number => 1 << d;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export interface Cell {
  x: number;
  y: number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EncounterSite {
  cell: number;
  /** The direction from this cell that leads toward the exit along a shortest path. */
  correctDir: Dir;
  onSolutionPath: boolean;
  /** 0-based order by distance from the entrance; used for difficulty progression. */
  order: number;
}

export type SpecialKind = 'oracle' | 'merchant';

export interface SpecialSite {
  cell: number;
  kind: SpecialKind;
  /** Direction of the open side (the creature faces it). */
  facing: Dir;
}

export interface Maze {
  seed: number;
  width: number;
  height: number;
  /** Bitmask of open sides per cell (bit(dir)). */
  open: Uint8Array;
  /** Room id per cell or -1. */
  room: Int16Array;
  rooms: Room[];
  start: number;
  /** Boundary side of the start cell where the entrance gate stands. */
  startDir: Dir;
  exit: number;
  /** Boundary side of the exit cell where the exit portal stands. */
  exitDir: Dir;
  distToExit: Int32Array;
  distFromStart: Int32Array;
  /** Cell indices from start to exit along a shortest path. */
  solution: number[];
  junctions: number[];
  deadEnds: number[];
  encounters: EncounterSite[];
  treasures: number[];
  specials: SpecialSite[];
  /** Cells that act as checkpoints when reached (chamber centres + midpoint). */
  checkpointCells: number[];
}
