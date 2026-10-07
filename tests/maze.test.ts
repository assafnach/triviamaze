import { describe, expect, it } from 'vitest';
import { MAZE_PROFILES } from '@/config/gameConfig';
import { correctDirection, generateMaze, isMeaningfulJunction } from '@/game/maze/generator';
import { bfs, degree, isOpen, neighbor, openDirs } from '@/game/maze/grid';
import { DIRS, DX, DY, opposite } from '@/game/maze/types';
import { validateMaze } from '@/game/maze/validate';
import { AGE_GROUPS } from '@/types';

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37);

describe('maze generation', () => {
  for (const age of AGE_GROUPS) {
    it(`always produces a valid, solvable maze for age ${age}`, () => {
      for (const seed of SEEDS) {
        const maze = generateMaze(seed, age);
        const result = validateMaze(maze, MAZE_PROFILES[age]);
        expect(result.reasons).toEqual([]);
        const dist = bfs(maze, maze.start);
        expect(dist[maze.exit]).toBeGreaterThan(0);
        expect(maze.solution[0]).toBe(maze.start);
        expect(maze.solution.at(-1)).toBe(maze.exit);
      }
    });
  }

  it('is deterministic for a seed', () => {
    const a = generateMaze(424242, '11-13');
    const b = generateMaze(424242, '11-13');
    expect(Array.from(a.open)).toEqual(Array.from(b.open));
    expect(a.encounters).toEqual(b.encounters);
    expect(a.treasures).toEqual(b.treasures);
  });

  it('produces different mazes for different seeds', () => {
    const a = generateMaze(1, '14-15');
    const b = generateMaze(2, '14-15');
    expect(Array.from(a.open)).not.toEqual(Array.from(b.open));
  });

  it('has symmetric walls and a closed outer boundary', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const maze = generateMaze(seed, '16+');
      for (let c = 0; c < maze.width * maze.height; c++) {
        const x = c % maze.width;
        const y = Math.floor(c / maze.width);
        for (const d of DIRS) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          const outside = nx < 0 || ny < 0 || nx >= maze.width || ny >= maze.height;
          if (outside) {
            expect(isOpen(maze, c, d)).toBe(false);
          } else {
            expect(isOpen(maze, c, d)).toBe(isOpen(maze, neighbor(maze, c, d), opposite(d)));
          }
        }
      }
    }
  });

  it('places creatures only at meaningful junctions, and their route leads to the exit', () => {
    for (const age of AGE_GROUPS) {
      for (const seed of SEEDS.slice(0, 25)) {
        const maze = generateMaze(seed, age);
        expect(maze.encounters.length).toBeLessThanOrEqual(MAZE_PROFILES[age].encounters);
        for (const e of maze.encounters) {
          expect(degree(maze, e.cell)).toBeGreaterThanOrEqual(3);
          expect(isMeaningfulJunction(maze, e.cell)).toBe(true);
          expect(correctDirection(maze, e.cell)).toBe(e.correctDir);
          // Following the creature's direction strictly reduces the distance to the exit.
          const next = neighbor(maze, e.cell, e.correctDir);
          expect(maze.distToExit[next]).toBe((maze.distToExit[e.cell] as number) - 1);
          // Every other open direction is strictly worse.
          for (const d of openDirs(maze, e.cell)) {
            if (d === e.correctDir) continue;
            expect(maze.distToExit[neighbor(maze, e.cell, d)] as number).toBeGreaterThan(
              maze.distToExit[e.cell] as number,
            );
          }
        }
      }
    }
  });

  it('spaces creatures out so exploration happens between encounters', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const maze = generateMaze(seed, '16+');
      for (let i = 0; i < maze.encounters.length; i++) {
        const dist = bfs(maze, maze.encounters[i]!.cell);
        for (let j = i + 1; j < maze.encounters.length; j++) {
          expect(dist[maze.encounters[j]!.cell]).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('scales complexity with age group', () => {
    const avg = (age: (typeof AGE_GROUPS)[number]): number =>
      SEEDS.slice(0, 20).reduce((s, seed) => s + generateMaze(seed, age).solution.length, 0) / 20;
    expect(avg('16+')).toBeGreaterThan(avg('5-7'));
    expect(avg('11-13')).toBeGreaterThan(avg('5-7'));
  });

  it('generates quickly', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) generateMaze(i * 13 + 7, '16+');
    expect((performance.now() - t0) / 50).toBeLessThan(40);
  });

  it('never puts treasures on the start, exit or creature cells', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const maze = generateMaze(seed, '8-10');
      const reserved = new Set([maze.start, maze.exit, ...maze.encounters.map((e) => e.cell)]);
      for (const t of maze.treasures) expect(reserved.has(t)).toBe(false);
      expect(new Set(maze.treasures).size).toBe(maze.treasures.length);
    }
  });
});
