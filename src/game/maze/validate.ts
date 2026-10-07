import type { MazeProfile } from '@/config/gameConfig';
import { bfs, degree } from './grid';
import type { Maze } from './types';

export interface MazeValidation {
  ok: boolean;
  reasons: string[];
}

/** Every maze is validated before the player ever sees it. Invalid mazes are regenerated. */
export function validateMaze(maze: Maze, profile: MazeProfile): MazeValidation {
  const reasons: string[] = [];
  const n = maze.width * maze.height;
  const inRange = (c: number): boolean => Number.isInteger(c) && c >= 0 && c < n;

  if (!inRange(maze.start)) reasons.push('missing entrance');
  if (!inRange(maze.exit)) reasons.push('missing exit');
  if (maze.start === maze.exit) reasons.push('entrance equals exit');
  if (reasons.length > 0) return { ok: false, reasons };

  const fromStart = bfs(maze, maze.start);
  for (let c = 0; c < n; c++) {
    if (fromStart[c] === -1) {
      reasons.push('unreachable cells');
      break;
    }
  }
  if (fromStart[maze.exit] === -1) reasons.push('exit unreachable');

  const pathLen = maze.solution.length;
  if (pathLen === 0 || maze.solution[0] !== maze.start || maze.solution[pathLen - 1] !== maze.exit) {
    reasons.push('no valid solution path');
  } else {
    for (let i = 1; i < pathLen; i++) {
      if (maze.distToExit[maze.solution[i] as number] !== (maze.distToExit[maze.solution[i - 1] as number] as number) - 1) {
        reasons.push('solution path is broken');
        break;
      }
    }
  }

  const longSide = Math.max(maze.width, maze.height);
  const minLen = Math.round(longSide * 1.6);
  const maxLen = Math.round(n * 0.75);
  if (pathLen < minLen) reasons.push(`path too short (${pathLen} < ${minLen})`);
  if (pathLen > maxLen) reasons.push(`path too long (${pathLen} > ${maxLen})`);

  const pathJunctions = maze.solution.filter((c) => degree(maze, c) >= 3).length;
  if (pathJunctions < 3) reasons.push('too few junctions on the solution path');

  const minEncounters = Math.min(profile.encounters, Math.max(3, profile.encounters - 2));
  if (maze.encounters.length < minEncounters) {
    reasons.push(`too few creature encounters (${maze.encounters.length} < ${minEncounters})`);
  }
  if (maze.encounters.filter((e) => e.onSolutionPath).length < Math.min(3, profile.encounters - 1)) {
    reasons.push('too few encounters on the solution path');
  }
  for (const e of maze.encounters) {
    if (!inRange(e.cell)) reasons.push('encounter out of range');
  }
  return { ok: reasons.length === 0, reasons };
}
