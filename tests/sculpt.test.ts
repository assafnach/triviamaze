import { describe, expect, it } from 'vitest';
import { biomeWeights } from '@/game/environments/biomes';
import { generateMaze } from '@/game/maze/generator';
import { meshPrims, shapeBounds, type Prim, type Shape } from '@/game/creatures/sculpt/mesher';

function prim(shape: Shape, op: Prim['op'] = 'add', bone = 0, color: [number, number, number] = [1, 0, 0], hard = false): Prim {
  const [min, max] = shapeBounds(shape);
  return { shape, op, k: 0.02, bone, surf: { color, rough: 0.5, detail: 0, emissive: [0, 0, 0], hard }, min, max };
}

const sphere = (c: [number, number, number], r: number): Shape => ({ t: 'sphere', c, r });

describe('sculpt mesher', () => {
  it('turns a sphere into a closed, smooth, skinned mesh', () => {
    const m = meshPrims([prim(sphere([0, 0, 0], 0.2))], 1, 0.02);
    const verts = m.position.length / 3;
    expect(verts).toBeGreaterThan(300);
    // Every vertex lies close to the sphere and has a unit, outward normal.
    for (let v = 0; v < verts; v++) {
      const x = m.position[v * 3] as number;
      const y = m.position[v * 3 + 1] as number;
      const z = m.position[v * 3 + 2] as number;
      const r = Math.hypot(x, y, z);
      expect(Math.abs(r - 0.2)).toBeLessThan(0.012);
      const nx = m.normal[v * 3] as number;
      const ny = m.normal[v * 3 + 1] as number;
      const nz = m.normal[v * 3 + 2] as number;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
      expect((nx * x + ny * y + nz * z) / r).toBeGreaterThan(0.9);
      // Skin weights always sum to one.
      const w = (m.skinWeight[v * 4] as number) + (m.skinWeight[v * 4 + 1] as number) + (m.skinWeight[v * 4 + 2] as number) + (m.skinWeight[v * 4 + 3] as number);
      expect(w).toBeCloseTo(1, 4);
    }
    // Closed surface: every edge is shared by exactly two triangles.
    const edges = new Map<string, number>();
    for (let t = 0; t < m.index.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = m.index[t + e] as number;
        const b = m.index[t + ((e + 1) % 3)] as number;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const count of edges.values()) expect(count).toBe(2);
  });

  it('carves material away', () => {
    const solid = meshPrims([prim(sphere([0, 0, 0], 0.2))], 1, 0.02);
    const hollowed = meshPrims([prim(sphere([0, 0, 0], 0.2)), prim(sphere([0.2, 0, 0], 0.12), 'sub')], 1, 0.02);
    let maxX = -1;
    for (let v = 0; v < hollowed.position.length / 3; v++) maxX = Math.max(maxX, hollowed.position[v * 3] as number);
    // The rim where the carved bowl meets the sphere sits near x = 0.164 (the uncut sphere reaches 0.2).
    expect(maxX).toBeLessThan(0.18);
    expect(hollowed.position.length).not.toBe(solid.position.length);
  });

  it('keeps hard materials crisp and binds vertices to the nearest bone', () => {
    const m = meshPrims([prim(sphere([-0.15, 0, 0], 0.12), 'add', 0, [1, 0, 0]), prim(sphere([0.15, 0, 0], 0.12), 'add', 1, [0, 0, 1], true)], 2, 0.015);
    for (let v = 0; v < m.position.length / 3; v++) {
      const x = m.position[v * 3] as number;
      if (Math.abs(x) < 0.08) continue;
      const left = x < 0;
      // Far from the seam, colour and bone come purely from the local shape.
      expect(m.color[v * 3 + (left ? 0 : 2)] as number).toBeGreaterThan(0.6);
      expect(m.skinIndex[v * 4]).toBe(left ? 0 : 1);
    }
  });

  it('meshes a detail region and excludes it from the body pass', () => {
    const prims = [prim(sphere([0, 0, 0], 0.25))];
    const box: [[number, number, number], [number, number, number]] = [
      [0.1, -0.3, -0.3],
      [0.3, 0.3, 0.3],
    ];
    const region = meshPrims(prims, 1, 0.01, { region: box });
    for (let v = 0; v < region.position.length / 3; v++) expect(region.position[v * 3] as number).toBeGreaterThan(0.1 - 0.03);
    const body = meshPrims(prims, 1, 0.02, { exclude: box });
    for (let t = 0; t < body.index.length; t += 3) {
      const cx = ((body.position[(body.index[t] as number) * 3] as number) + (body.position[(body.index[t + 1] as number) * 3] as number) + (body.position[(body.index[t + 2] as number) * 3] as number)) / 3;
      expect(cx).toBeLessThan(0.1 + 1e-6);
    }
  });
});

describe('biome crossover', () => {
  it('starts in the first biome and ends in the second, changing smoothly', () => {
    const maze = generateMaze(4242, '11-13');
    const w = biomeWeights(maze.distFromStart, maze.exit);
    expect(w[maze.start]).toBe(0);
    expect(w[maze.exit]).toBe(1);
    // Along the true route the weight never decreases.
    let prev = 0;
    for (const c of maze.solution) {
      expect(w[c] as number).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = w[c] as number;
    }
  });
});
