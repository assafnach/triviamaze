import * as THREE from 'three';
import type { BuildContext, SkinnedRig } from '../rig';
import { SIDES, arms, biped, face, finish, hair, legs, neck, torso, type Surface } from '../sculpt/anatomy';
import { glowTexture } from '../../render/textures';
import { Sculpt } from '../sculpt/Sculpt';
import type { V3 } from '../sculpt/sdf';

const SKIN: Surface = { color: 0xf0d2bc, rough: 0.4, detail: 'skin' };
const LIPS: Surface = { color: 0xd8848a, rough: 0.35, detail: 'skin' };
const HAIR: Surface = { color: 0x7ac8a0, rough: 0.5, detail: 'fur', hard: true };
const PETAL: Surface = { color: 0xf0a8c8, rough: 0.55, detail: 'skin', hard: true };
const PETAL_DEEP: Surface = { color: 0xc86aa0, rough: 0.55, detail: 'skin', hard: true };
const LEAF: Surface = { color: 0x6aa83a, rough: 0.6, detail: 'moss', hard: true };
const GLOW: Surface = { color: 0xfff0a0, rough: 0.4, detail: 'skin', emissive: 0xffd040, glow: 2.2, hard: true };

/** Translucent dragonfly wing with veins, drawn once and shared. */
let wingTex: THREE.Texture | null = null;
function wingTexture(): THREE.Texture {
  if (wingTex) return wingTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(200,255,240,0.55)');
  g.addColorStop(1, 'rgba(255,220,255,0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(128, 64, 126, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, 64);
  ctx.lineTo(250, 60);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const x = 20 + i * 16;
    ctx.beginPath();
    ctx.moveTo(x, 62);
    ctx.quadraticCurveTo(x + 10, 30, x + 18, 18 + Math.abs(i - 7) * 3);
    ctx.moveTo(x, 64);
    ctx.quadraticCurveTo(x + 10, 96, x + 18, 110 - Math.abs(i - 7) * 3);
    ctx.stroke();
  }
  wingTex = new THREE.CanvasTexture(c);
  wingTex.colorSpace = THREE.SRGBColorSpace;
  return wingTex;
}

/** Nitzanit, the firefly fairy: a hand-high sprite in a petal dress, dragonfly wings, a lantern-glow at her heart. */
export async function buildFairy(ctx: BuildContext): Promise<SkinnedRig> {
  const s = new Sculpt();
  const b = biped(s, {
    height: 0.34,
    hip: 0.15,
    shoulder: 0.235,
    shoulderW: 0.034,
    hipW: 0.017,
    head: [0, 0.285, 0.0],
    headR: 0.042,
    chestZ: 0.0,
    arm: [0.055, 0.05, 0.03],
    armSpread: 0.45,
  });
  const wingBones = { L: s.bone('wingL', [0.012, 0.225, -0.02], b.chest), R: s.bone('wingR', [-0.012, 0.225, -0.02], b.chest) };
  torso(b, { surf: SKIN, chest: [0.024, 0.028, 0.018], belly: [0.019, 0.024, 0.016], pelvis: [0.023, 0.018, 0.018] });
  neck(b, SKIN, 0.009);
  const f = face(b, {
    skin: SKIN,
    brow: 0.1,
    nose: 'button',
    noseLen: 0.15,
    lips: LIPS,
    mouthW: 0.24,
    ears: 'elf',
    earSize: 0.8,
    eyeR: 0.042 * 0.17,
    eyeX: 0.36,
    lids: 0.1,
    chin: 0.7,
    cheeks: { color: 0xf0a0a0, rough: 0.4, detail: 'skin' },
  });
  hair(b, { surf: HAIR, length: 0.03, volume: 1.12 });
  // A glowing heart-lantern on her chest and a dress of overlapping petals.
  s.sphere([0, 0.215, 0.022], 0.009, { bone: b.chest, surf: GLOW, blend: 0.002 });
  // Petal skirt flaring out like an upturned flower.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const p: V3 = [out[0] * 0.03, 0.135, out[2] * 0.028];
    s.blade(p, [out[0], -0.55, out[2]], [0, 1, 0], 0.03, 0.017, 0.0035, { bone: b.hips, surf: i % 2 ? PETAL : PETAL_DEEP, blend: 0.002 });
  }
  s.ellipsoid([0, 0.2, 0.0], [0.028, 0.03, 0.022], { bone: b.chest, surf: LEAF, blend: 0.003 });
  arms(b, { surf: SKIN, r: [0.0075, 0.0065, 0.005], muscle: 1.0, hand: { surf: SKIN, fingers: 4, fingerR: 0.0015, fingerLen: 0.7, curl: 0.3 } });
  legs(b, { surf: SKIN, r: [0.01, 0.008, 0.006], foot: 'bare', toes: 1 });
  const rig = await finish(
    s,
    {
      ctx,
      eyes: f.eyes.map((e) => ({ ...e, bone: b.head })),
      iris: 0x6ad0a0,
      irisScale: 1.6,
      material: { sheen: 0.5, sheenColor: 0xffe0f0 },
      detail: 0.8,
    },
    {
      height: 0.34,
      gait: 'hover',
      pointWith: 'armR',
      flying: true,
      hoverHeight: 1.35,
      magic: 0xfff0a0,
      radius: 0.2,
      walkSpeed: 0,
    },
  );
  // Two pairs of translucent wings on the wing bones (flapped by the controller).
  const mat = new THREE.MeshBasicMaterial({ map: wingTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const geo = new THREE.PlaneGeometry(0.16, 0.07);
  geo.translate(0.08, 0, 0);
  for (const [side, x] of SIDES) {
    const bone = wingBones[side];
    for (const [i, tilt] of [0.35, -0.3].entries()) {
      const w = new THREE.Mesh(geo, mat);
      w.rotation.set(Math.PI / 2 - 0.5, 0, tilt);
      w.scale.set(x * (i === 0 ? 1 : 0.85), 1, 1);
      w.position.set(0, i === 0 ? 0.01 : -0.012, 0);
      bone.add(w);
    }
  }
  // A soft halo around her (fireflies are their own lanterns).
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe08a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(0.5);
  halo.position.set(0, 0.2, 0);
  rig.root.add(halo);
  rig.disposables.push(geo, mat, haloMat);
  rig.extra = (t, _dt, mood) => {
    haloMat.opacity = (0.25 + Math.sin(t * 5) * 0.08) * mood;
  };
  return rig;
}
