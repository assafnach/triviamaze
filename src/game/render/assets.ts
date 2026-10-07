import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** A photoscanned PBR material set (Poly Haven, CC0): diffuse, OpenGL normal, AO/rough/metal. */
export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
}

export interface PropTemplate {
  /** Meshes with their node transforms baked, ready to instance. */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[];
  /** Bounding box of the whole prop in its own space. */
  box: THREE.Box3;
}

const BASE = `${import.meta.env.BASE_URL}assets`;

function solidTexture(r: number, g: number, b: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/**
 * Loads and caches the third-party assets in `public/assets` (see public/assets/CREDITS.md).
 * Everything is fetched once per session and shared between runs.
 */
class AssetLibrary {
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly props = new Map<string, Promise<PropTemplate>>();
  private readonly sets = new Map<string, Promise<PbrSet>>();
  private readonly flatNormal = solidTexture(128, 128, 255);
  private readonly white = solidTexture(255, 255, 255);
  anisotropy = 8;

  /** Decodes off the main thread where the browser allows it. */
  private async texture(url: string, srgb: boolean): Promise<THREE.Texture> {
    let t: THREE.Texture;
    if (typeof createImageBitmap !== 'undefined') {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      t = new THREE.Texture(bmp);
      t.flipY = false;
    } else {
      t = await new THREE.TextureLoader().loadAsync(url);
    }
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    t.needsUpdate = true;
    return t;
  }

  pbr(name: string): Promise<PbrSet> {
    let p = this.sets.get(name);
    if (!p) {
      p = Promise.all([
        this.texture(`${BASE}/textures/${name}/diff.webp`, true),
        this.texture(`${BASE}/textures/${name}/nor.webp`, false),
        this.texture(`${BASE}/textures/${name}/arm.webp`, false),
      ]).then(([map, normalMap, arm]) => ({ map, normalMap, arm }));
      this.sets.set(name, p);
    }
    return p;
  }

  /**
   * Every scanned prop is rebuilt onto the same material layout (albedo + normal + roughness/metal
   * maps), so the whole prop library shares two or three shader programs instead of dozens.
   */
  private normalize(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial | null {
    if (/flame/i.test(m.name)) return null; // Flames are drawn by the particle flame system.
    const mask = m.alphaTest > 0 || /fern|moss/i.test(m.name);
    const glass = !mask && (m.transparent || /glass/i.test(m.name));
    const mr = m.roughnessMap ?? m.metalnessMap ?? this.white;
    if (m.map) m.map.anisotropy = this.anisotropy;
    const out = new THREE.MeshStandardMaterial({
      name: m.name,
      color: m.color,
      map: m.map,
      normalMap: m.normalMap ?? this.flatNormal,
      normalScale: m.normalScale.clone(),
      roughnessMap: mr,
      metalnessMap: mr,
      roughness: glass ? 0.08 : m.roughness,
      metalness: glass ? 0 : m.metalness,
      envMapIntensity: 0.8,
      // Double-sided only for cut-out foliage (double-sided *transparent* surfaces draw twice).
      side: mask ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: mask ? 0.5 : 0,
      transparent: glass,
      opacity: glass ? 0.32 : 1,
      depthWrite: !glass,
    });
    m.dispose();
    return out;
  }

  prop(name: string): Promise<PropTemplate> {
    let p = this.props.get(name);
    if (!p) {
      p = this.gltf.loadAsync(`${BASE}/models/${name}.glb`).then((g) => {
        const parts: PropTemplate['parts'] = [];
        const remap = new Map<THREE.Material, THREE.MeshStandardMaterial | null>();
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const src = o.material as THREE.MeshStandardMaterial;
          if (!remap.has(src)) remap.set(src, this.normalize(src));
          const material = remap.get(src);
          if (material) parts.push({ geometry: o.geometry, material, matrix: o.matrixWorld.clone() });
        });
        const box = new THREE.Box3().setFromObject(g.scene);
        return { parts, box };
      });
      this.props.set(name, p);
    }
    return p;
  }

  /** Loads many assets in parallel, reporting progress in [0, 1]. */
  async preload(props: string[], pbrs: string[], onProgress?: (p: number) => void): Promise<void> {
    const total = props.length + pbrs.length;
    let done = 0;
    const tick = (): void => {
      done++;
      onProgress?.(done / Math.max(1, total));
    };
    await Promise.all([
      ...props.map((n) =>
        this.prop(n)
          .then(tick)
          .catch((e) => {
            console.warn('[assets] prop failed', n, e);
            tick();
          }),
      ),
      ...pbrs.map((n) =>
        this.pbr(n)
          .then(tick)
          .catch((e) => {
            console.warn('[assets] material failed', n, e);
            tick();
          }),
      ),
    ]);
  }

  /** The loaded templates for `names` (missing ones are skipped). */
  async resolveAll(names: string[]): Promise<Map<string, PropTemplate>> {
    const out = new Map<string, PropTemplate>();
    for (const n of names) {
      try {
        out.set(n, await this.prop(n));
      } catch {
        /* missing prop: callers skip it */
      }
    }
    return out;
  }
}

export const assets = new AssetLibrary();

/**
 * Places many copies of a prop with one draw call per sub-mesh (InstancedMesh).
 * `matrices` are world transforms for the prop's origin.
 */
export function instanceProp(tpl: PropTemplate, matrices: THREE.Matrix4[], opts: { castShadow?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  if (matrices.length === 0) return g;
  const m = new THREE.Matrix4();
  for (const part of tpl.parts) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
    matrices.forEach((w, i) => {
      m.multiplyMatrices(w, part.matrix);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = opts.castShadow ?? true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    g.add(inst);
  }
  return g;
}

/** Uploads every texture used in a scene to the GPU, a few per frame, so play starts without hitches. */
export async function uploadTextures(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, onProgress?: (p: number) => void): Promise<void> {
  const textures = new Set<THREE.Texture>();
  const add = (v: unknown): void => {
    if (v instanceof THREE.Texture) textures.add(v);
  };
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(mat)) add(v);
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) add(x?.value);
      const extra = mat.userData?.textures as THREE.Texture[] | undefined;
      extra?.forEach(add);
    }
  });
  let i = 0;
  for (const t of textures) {
    renderer.initTexture(t);
    i++;
    if (i % 6 === 0) {
      onProgress?.(i / textures.size);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
