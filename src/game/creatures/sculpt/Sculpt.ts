import * as THREE from 'three';
import { meshPrims, shapeBounds, type MeshData, type Prim, type Relief, type Shape } from './mesher';

/** A region (usually the head) meshed at a finer resolution than the rest of the body. */
export interface DetailRegion {
  min: V3;
  max: V3;
  voxel: number;
}
import { meshAsync, type JobOptions } from './pool';
import type { V3 } from './sdf';

export type { Relief } from './mesher';

/** Surface detail families understood by the creature shader (`detailShader.ts`). */
export const DETAIL = {
  skin: 0,
  bark: 1,
  stone: 2,
  cloth: 3,
  feather: 4,
  lava: 5,
  crystal: 6,
  scales: 7,
  runes: 8,
  horn: 9,
  fur: 10,
  moss: 11,
  metal: 12,
  ghost: 13,
} as const;
export type Detail = keyof typeof DETAIL;

export interface Surface {
  color: number;
  rough?: number;
  detail?: Detail;
  emissive?: number;
  glow?: number;
  /** Garments, armour, accessories: keep a crisp material edge instead of blending colours. */
  hard?: boolean;
}

export interface PrimOptions {
  bone?: THREE.Bone;
  /** Smooth-blend radius with what's already there (metres). */
  blend?: number;
  surf?: Surface;
  relief?: Relief;
}

/** Orthonormal basis whose first axis points along `dir`, second as close to `up` as possible. */
export function basis(dir: V3, up: V3 = [0, 1, 0]): [V3, V3, V3] {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const u: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  // w = u × up, v = w × u
  let w: V3 = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]];
  let wl = Math.hypot(w[0], w[1], w[2]);
  if (wl < 1e-6) {
    w = [u[1] * 0 - u[2] * 1, u[2] * 0 - u[0] * 0, u[0] * 1 - u[1] * 0];
    wl = Math.hypot(w[0], w[1], w[2]) || 1;
  }
  w = [w[0] / wl, w[1] / wl, w[2] / wl];
  const v: V3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  return [u, v, w];
}

function mergeMeshes(a: MeshData, b: MeshData): MeshData {
  const cat = <T extends Float32Array | Uint16Array | Uint32Array>(x: T, y: T, make: (n: number) => T): T => {
    const out = make(x.length + y.length);
    out.set(x, 0);
    out.set(y, x.length);
    return out;
  };
  const f32 = (n: number): Float32Array => new Float32Array(n);
  const offset = a.position.length / 3;
  const index = new Uint32Array(a.index.length + b.index.length);
  index.set(a.index, 0);
  for (let i = 0; i < b.index.length; i++) index[a.index.length + i] = (b.index[i] as number) + offset;
  return {
    position: cat(a.position, b.position, f32),
    normal: cat(a.normal, b.normal, f32),
    color: cat(a.color, b.color, f32),
    rough: cat(a.rough, b.rough, f32),
    detail: cat(a.detail, b.detail, f32),
    emissive: cat(a.emissive, b.emissive, f32),
    skinIndex: cat(a.skinIndex, b.skinIndex, (n) => new Uint16Array(n)),
    skinWeight: cat(a.skinWeight, b.skinWeight, f32),
    index,
    ms: Math.max(a.ms, b.ms),
  };
}

export interface SculptResult {
  mesh: THREE.SkinnedMesh;
  root: THREE.Bone;
  bones: Map<string, THREE.Bone>;
  triangles: number;
  ms: number;
}

/**
 * Procedural sculpting: shapes are smoothly blended into one organic, watertight surface,
 * extracted with surface nets, given per-vertex materials and skinned to a bone hierarchy.
 */
export class Sculpt {
  private readonly prims: Prim[] = [];
  readonly root = new THREE.Bone();
  private readonly boneList: THREE.Bone[] = [];
  private readonly boneWorld = new Map<THREE.Bone, V3>();
  readonly bones = new Map<string, THREE.Bone>();

  constructor() {
    this.root.name = 'root';
    this.boneList.push(this.root);
    this.boneWorld.set(this.root, [0, 0, 0]);
    this.bones.set('root', this.root);
  }

  /** Adds a bone at a rest position in creature space. */
  bone(name: string, pos: V3, parent: THREE.Bone = this.root): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    const pw = this.boneWorld.get(parent) as V3;
    b.position.set(pos[0] - pw[0], pos[1] - pw[1], pos[2] - pw[2]);
    parent.add(b);
    this.boneList.push(b);
    this.boneWorld.set(b, pos);
    this.bones.set(name, b);
    return b;
  }

  worldOf(bone: THREE.Bone): V3 {
    return this.boneWorld.get(bone) as V3;
  }

  private push(shape: Shape, op: Prim['op'], o: PrimOptions): void {
    const [min, max] = shapeBounds(shape);
    const s = o.surf ?? { color: 0xff00ff };
    this.prims.push({
      shape,
      op,
      k: o.blend ?? 0.04,
      bone: this.boneList.indexOf(o.bone ?? this.root),
      surf: {
        color: new THREE.Color(s.color).toArray() as V3,
        rough: s.rough ?? 0.7,
        detail: DETAIL[s.detail ?? 'skin'],
        emissive: new THREE.Color(s.emissive ?? 0x000000).multiplyScalar(s.glow ?? (s.emissive ? 1 : 0)).toArray() as V3,
        hard: s.hard ?? false,
      },
      relief: o.relief,
      min,
      max,
    });
  }

  sphere(c: V3, r: number, o: PrimOptions = {}): this {
    this.push({ t: 'sphere', c, r }, 'add', o);
    return this;
  }
  ellipsoid(c: V3, r: V3, o: PrimOptions = {}): this {
    this.push({ t: 'ell', c, r }, 'add', o);
    return this;
  }
  /** Tapered capsule — limbs, necks, horns, fingers. */
  limb(a: V3, b: V3, r1: number, r2: number, o: PrimOptions = {}): this {
    this.push({ t: 'cone', a, b, r1, r2 }, 'add', o);
    return this;
  }
  /** A smooth curved tube through several points (tails, antlers, tentacles, roots). */
  chain(points: V3[], radii: number[], o: PrimOptions & { bones?: THREE.Bone[] } = {}): this {
    for (let i = 0; i < points.length - 1; i++) {
      this.push(
        { t: 'cone', a: points[i] as V3, b: points[i + 1] as V3, r1: radii[i] as number, r2: radii[i + 1] as number },
        'add',
        { ...o, bone: o.bones?.[Math.min(i, (o.bones?.length ?? 1) - 1)] ?? o.bone, blend: o.blend ?? 0.015 },
      );
    }
    return this;
  }
  box(c: V3, half: V3, round: number, o: PrimOptions & { ry?: number; rx?: number } = {}): this {
    this.push({ t: 'box', c, half, round, ry: o.ry ?? 0, rx: o.rx ?? 0 }, 'add', o);
    return this;
  }
  cone(c: V3, h: number, r1: number, r2: number, o: PrimOptions = {}): this {
    this.push({ t: 'ccone', c, h, r1, r2 }, 'add', o);
    return this;
  }
  torus(c: V3, R: number, r: number, o: PrimOptions = {}): this {
    this.push({ t: 'torus', c, R, r }, 'add', o);
    return this;
  }
  /**
   * Flat or elongated oriented ellipsoid: `length` along `dir`, `width` along the axis closest to
   * `up`, `thickness` along the remaining axis. Ears, leaves, wings, plates, petals.
   */
  blade(c: V3, dir: V3, up: V3, length: number, width: number, thickness: number, o: PrimOptions = {}): this {
    const [u, v, w] = basis(dir, up);
    this.push({ t: 'oell', c, u, v, w, r: [length, width, thickness] }, 'add', o);
    return this;
  }
  carveBlade(c: V3, dir: V3, up: V3, length: number, width: number, thickness: number, blend = 0.008): this {
    const [u, v, w] = basis(dir, up);
    this.push({ t: 'oell', c, u, v, w, r: [length, width, thickness] }, 'sub', { blend });
    return this;
  }
  /** Carves material away (mouths, nostrils, eye sockets, robe hems). */
  carveSphere(c: V3, r: number, blend = 0.01): this {
    this.push({ t: 'sphere', c, r }, 'sub', { blend });
    return this;
  }
  carveEllipsoid(c: V3, r: V3, blend = 0.01): this {
    this.push({ t: 'ell', c, r }, 'sub', { blend });
    return this;
  }
  carveLimb(a: V3, b: V3, r1: number, r2: number, blend = 0.01): this {
    this.push({ t: 'cone', a, b, r1, r2 }, 'sub', { blend });
    return this;
  }
  /** Recolours a region without changing geometry (bellies, stripes, cheeks, moss). */
  paintSphere(c: V3, r: number, surf: Surface, blend = 0.04): this {
    this.push({ t: 'sphere', c, r }, 'paint', { surf, blend });
    this.markPaintDetail(surf);
    return this;
  }
  paintEllipsoid(c: V3, r: V3, surf: Surface, blend = 0.04): this {
    this.push({ t: 'ell', c, r }, 'paint', { surf, blend });
    this.markPaintDetail(surf);
    return this;
  }
  paintLimb(a: V3, b: V3, r1: number, r2: number, surf: Surface, blend = 0.03): this {
    this.push({ t: 'cone', a, b, r1, r2 }, 'paint', { surf, blend });
    this.markPaintDetail(surf);
    return this;
  }
  private markPaintDetail(surf: Surface): void {
    if (surf.detail) (this.prims[this.prims.length - 1] as Prim).paintDetail = true;
  }

  /** Mirror helper for bilateral anatomy: calls fn for +x (side 1) and -x (side -1). */
  both(fn: (s: 1 | -1, m: (v: V3) => V3) => void): this {
    fn(1, (v) => v);
    fn(-1, (v) => [-v[0], v[1], v[2]]);
    return this;
  }

  /** Meshes synchronously on this thread (tests, tools). */
  build(material: THREE.Material, voxel = 0.02): SculptResult {
    return this.finish(meshPrims(this.prims, this.boneList.length, voxel), material);
  }

  /**
   * Meshes on the worker pool (memoised per sculpt and resolution). With `detail`, that region
   * is meshed separately at its own finer resolution and merged with the body; the two passes
   * overlap by about a voxel so no seam opens between them.
   */
  async buildAsync(material: THREE.Material, voxel = 0.02, detail?: DetailRegion, job?: JobOptions): Promise<SculptResult> {
    const n = this.boneList.length;
    if (!detail) return this.finish(await meshAsync(this.prims, n, voxel, {}, job), material);
    const ov = voxel * 0.75;
    const grow = (k: number): [V3, V3] => [
      [detail.min[0] - k, detail.min[1] - k, detail.min[2] - k],
      [detail.max[0] + k, detail.max[1] + k, detail.max[2] + k],
    ];
    const [body, head] = await Promise.all([
      meshAsync(this.prims, n, voxel, { exclude: grow(-ov * 0.5) }, job),
      meshAsync(this.prims, n, detail.voxel, { region: grow(ov) }, job),
    ]);
    return this.finish(mergeMeshes(body, head), material);
  }

  private finish(m: MeshData, material: THREE.Material): SculptResult {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
    geo.setAttribute('aRough', new THREE.BufferAttribute(m.rough, 1));
    geo.setAttribute('aDetail', new THREE.BufferAttribute(m.detail, 1));
    geo.setAttribute('aEmissive', new THREE.BufferAttribute(m.emissive, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.add(this.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.boneList));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, root: this.root, bones: this.bones, triangles: m.index.length / 3, ms: m.ms };
  }
}
