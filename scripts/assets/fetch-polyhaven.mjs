// Downloads CC0 assets from Poly Haven (https://polyhaven.com, all assets CC0) and optimises them for the web:
//  - models: weld + simplify (meshoptimizer) + WebP textures + meshopt compression → public/assets/models/*.glb
//  - materials: 1k diffuse / normal (GL) / ARM → WebP → public/assets/textures/<name>/{diff,nor,arm}.webp
// Re-run with `node scripts/assets/fetch-polyhaven.mjs` (downloads are cached in .asset-cache/).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const UA = { 'User-Agent': 'triviamaze-asset-pipeline/1.0 (CC0 asset fetch)' };
const CACHE = '.asset-cache';
const OUT_MODELS = 'public/assets/models';
const OUT_TEX = 'public/assets/textures';

/** name → [simplify ratio, texture size, max simplification error]. Tuned per asset so hero pieces keep their detail. */
export const MODELS = {
  gothic_statue: [0.55, 1024],
  marble_bust_01: [0.3, 512],
  lion_head: [0.15, 512],
  large_castle_door: [0.8, 1024],
  large_iron_gate: [0.3, 1024],
  stone_fire_pit: [0.9, 512],
  treasure_chest: [0.07, 1024],
  kite_shield: [0.5, 512],
  ornate_war_hammer: [0.8, 512],
  antique_estoc: [0.7, 512],
  wine_barrel_01: [0.5, 512],
  wooden_crate_01: [0.8, 512],
  wooden_crate_02: [0.8, 512],
  wooden_bucket_01: [0.7, 512],
  wooden_candlestick: [0.03, 256, 0.02],
  vintage_oil_lamp: [0.8, 512],
  wooden_lantern_01: [0.8, 512],
  book_encyclopedia_set_01: [0.12, 512, 0.01],
  wooden_bookshelf_worn: [0.8, 1024],
  antique_ceramic_vase_01: [0.6, 512],
  ceramic_vase_02: [1, 512],
  wooden_stool_01: [0.5, 512],
  wicker_basket_01: [0.15, 512, 0.01],
  lantern_chandelier_01: [1, 512],
  rock_moss_set_01: [0.2, 1024, 0.006],
  rock_moss_set_02: [0.2, 1024, 0.006],
  root_cluster_01: [0.06, 1024],
  tree_stump_01: [0.18, 512],
  dead_tree_trunk: [0.08, 512],
  fern_02: [1, 512],
  moss_01: [0.03, 512],
  rock_face_01: [0.8, 1024],
  namaqualand_boulder_02: [0.05, 1024, 0.01],
  mountainside: [0.1, 1024, 0.01],
};

export const TEXTURES = [
  // Ruins
  'castle_wall_varriation',
  'mossy_stone_wall',
  'rustic_stone_wall',
  'mossy_cobblestone',
  'forest_ground_04',
  // Forest
  'mossy_rock',
  'lichen_rock',
  'forest_leaves_02',
  'leaves_forest_ground',
  'bark_willow',
  // Crystal caverns
  'dark_rock_02',
  'rock_wall_02',
  'river_small_rocks',
  // Volcanic
  'dark_rock',
  'burned_ground_01',
  // Temple
  'sandstone_blocks_08',
  'old_sandstone_02',
  'monastery_stone_floor',
  'stone_tiles_02',
];

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, path) {
  if (existsSync(path) && statSync(path).size > 0) return;
  mkdirSync(dirname(path), { recursive: true });
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
}

async function fetchModel(name, [ratio, texSize, error = 0.002], io, credits) {
  const files = await getJson(`https://api.polyhaven.com/files/${name}`);
  const info = await getJson(`https://api.polyhaven.com/info/${name}`);
  credits.push({ name: info.name, id: name, authors: Object.keys(info.authors ?? {}), type: 'model' });
  const g = files.gltf['1k'].gltf;
  const dir = join(CACHE, 'models', name);
  const gltfPath = join(dir, `${name}.gltf`);
  await download(g.url, gltfPath);
  for (const [rel, f] of Object.entries(g.include)) await download(f.url, join(dir, rel));
  const doc = await io.read(gltfPath);
  const before = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error })] : []),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 82 }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const after = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  mkdirSync(OUT_MODELS, { recursive: true });
  const out = join(OUT_MODELS, `${name}.glb`);
  await io.write(out, doc);
  console.log(`model ${name.padEnd(26)} tris ${Math.round(before)} → ${Math.round(after)}  ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

async function fetchTexture(name, credits) {
  const files = await getJson(`https://api.polyhaven.com/files/${name}`);
  const info = await getJson(`https://api.polyhaven.com/info/${name}`);
  credits.push({ name: info.name, id: name, authors: Object.keys(info.authors ?? {}), type: 'texture' });
  const maps = { diff: files.Diffuse, nor: files.nor_gl, arm: files.arm };
  const outDir = join(OUT_TEX, name);
  mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const [key, map] of Object.entries(maps)) {
    const src = map['1k'].jpg.url;
    const cached = join(CACHE, 'textures', name, `${key}.jpg`);
    await download(src, cached);
    const out = join(outDir, `${key}.webp`);
    // Normal/ARM maps hold data, not colour: keep them near-lossless.
    const quality = key === 'diff' ? 84 : 92;
    await sharp(await readFile(cached)).webp({ quality }).toFile(out);
    bytes += statSync(out).size;
  }
  console.log(`texture ${name.padEnd(26)} ${(bytes / 1e6).toFixed(2)} MB`);
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO(fetch).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const only = process.argv.slice(2);
  const credits = [];
  for (const [name, opts] of Object.entries(MODELS)) {
    if (only.length && !only.includes(name)) continue;
    try {
      await fetchModel(name, opts, io, credits);
    } catch (e) {
      console.error('FAILED model', name, e.message);
    }
  }
  for (const name of TEXTURES) {
    if (only.length && !only.includes(name)) continue;
    try {
      await fetchTexture(name, credits);
    } catch (e) {
      console.error('FAILED texture', name, e.message);
    }
  }
  if (!only.length) {
    const lines = [
      '# Third-party assets',
      '',
      'All models and materials in `public/assets/` come from [Poly Haven](https://polyhaven.com) and are released under **CC0** (public domain). No attribution is legally required; credit is given with thanks.',
      '',
      '| Asset | Type | Authors |',
      '| --- | --- | --- |',
      ...credits.map((c) => `| [${c.name}](https://polyhaven.com/a/${c.id}) | ${c.type} | ${c.authors.join(', ')} |`),
      '',
      'Assets were optimised for the web (mesh simplification, WebP textures, meshopt compression) by `scripts/assets/fetch-polyhaven.mjs`.',
      '',
    ];
    writeFileSync('public/assets/CREDITS.md', lines.join('\n'));
  }
}

main();
