import { BIOME_LOOK, type LayerDef } from '../environments/biomes';
import type { ThemeDef } from '../environments/themes';
import { assets } from './assets';
import { createEnvMaterial, type MazeFields, type SurfaceLayer } from './envMaterial';
import { createThemeMaterials, type ThemeMaterials } from './materials';

async function layer(def: LayerDef, worldUv: number): Promise<SurfaceLayer> {
  const set = await assets.pbr(def.tex);
  return {
    set,
    tint: def.tint,
    // Geometry UVs are metres / worldUv; the texture should repeat every `metres`.
    scale: worldUv / def.metres,
    normalScale: def.normalScale,
    roughness: def.roughness,
    moss: def.moss,
    wet: def.wet,
  };
}

/**
 * Scanned-material version of the theme palette: walls, trims, floors and ceilings use
 * photoscanned PBR sets (blending into the second biome where the run crosses over), everything
 * else keeps the lightweight shared materials.
 */
export async function createPbrThemeMaterials(
  a: ThemeDef,
  b: ThemeDef | null,
  fields: MazeFields,
  textureSize: number,
): Promise<ThemeMaterials> {
  const base = createThemeMaterials(a, Math.min(textureSize, 512));
  const la = BIOME_LOOK[a.id];
  const lb = b ? BIOME_LOOK[b.id] : null;
  const wallUv = a.wall.scale;
  const floorUv = a.floor.scale;
  const [wallA, trimA, floorA, ceilA] = await Promise.all([
    layer(la.wall, wallUv),
    layer(la.trim, wallUv),
    layer(la.floor, floorUv),
    layer(la.ceiling, 4),
  ]);
  const [wallB, trimB, floorB, ceilB] = lb
    ? await Promise.all([layer(lb.wall, wallUv), layer(lb.trim, wallUv), layer(lb.floor, floorUv), layer(lb.ceiling, 4)])
    : [undefined, undefined, undefined, undefined];
  const env = la.envIntensity;
  const wall = createEnvMaterial({ a: wallA, b: wallB, fields, kind: 'wall', grime: la.grime, envIntensity: env });
  const trim = createEnvMaterial({ a: trimA, b: trimB, fields, kind: 'trim', grime: la.grime, envIntensity: env });
  const floor = createEnvMaterial({ a: floorA, b: floorB, fields, kind: 'floor', envIntensity: env });
  const ceiling = createEnvMaterial({ a: ceilA, b: ceilB, fields, kind: 'ceiling', envIntensity: env * 0.5 });
  // Statues and pedestals share the dressed stone of the trims.
  const stone = trim;
  const replaced = [base.wall, base.trim, base.floor, base.ceiling, base.stone];
  for (const m of replaced) m.dispose();
  const own = [wall, trim, floor, ceiling];
  return {
    ...base,
    wall,
    trim,
    floor,
    ceiling,
    stone,
    dispose() {
      base.dispose();
      for (const m of own) m.dispose();
    },
  };
}

