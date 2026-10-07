import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '@/utils/rng';

/**
 * Masonry kit: dressed-stone pieces with chamfered edges that catch the light, built from many
 * individual stones (with tiny irregularities) instead of single extruded slabs.
 */

/** Strips everything but position/normal/uv so pieces from different generators can merge. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
  return ng;
}

function stone(shape: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}

export function chamferBox(w: number, h: number, d: number, r = 0.025): THREE.BufferGeometry {
  return clean(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
}

export interface ArchPieces {
  /** Dressed stone: voussoirs, piers, string course. */
  dressed: THREE.BufferGeometry;
  /** Rubble masonry filling the spandrels above the ring. */
  fill: THREE.BufferGeometry;
}

/**
 * A round masonry arch spanning `opening`, springing at `spring`, centred at x = 0, standing on
 * y = 0 and facing ±Z. Built from voussoirs around a keystone, stacked pier blocks (quoins),
 * spandrel masonry and a string course on top.
 */
export function masonryArch(opening: number, spring: number, frame: number, depth: number, rng: Rng, opts: { damaged?: boolean; top?: number } = {}): ArchPieces {
  const r = opening / 2;
  const ring = frame * 1.05;
  const dressed: THREE.BufferGeometry[] = [];
  const fill: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const joint = 0.012;

  // Piers: stacked blocks alternating long/short into the wall (quoins).
  for (const side of [-1, 1]) {
    let y = 0;
    let i = 0;
    while (y < spring - 0.05) {
      const h = Math.min(spring - y, rng.range(0.38, 0.55));
      const w = frame * (i % 2 === 0 ? 1.0 : 1.22);
      const g = chamferBox(w - joint, h - joint, depth * rng.range(0.96, 1.04), 0.03);
      const x = side * (r + w / 2);
      m.makeTranslation(x + rng.range(-0.008, 0.008), y + h / 2, rng.range(-0.01, 0.01));
      g.applyMatrix4(m);
      dressed.push(g);
      y += h;
      i++;
    }
    // Impost block where the arch springs.
    const imp = chamferBox(frame * 1.35, 0.16, depth * 1.12, 0.03);
    imp.applyMatrix4(m.makeTranslation(side * (r + frame * 0.6), spring - 0.06, 0));
    dressed.push(imp);
  }

  // Voussoirs.
  const n = 11;
  const slip = opts.damaged ? rng.range(0.02, 0.05) : rng.range(0, 0.012);
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * Math.PI;
    const a1 = Math.PI - ((i + 1) / n) * Math.PI;
    const key = i === (n - 1) / 2;
    const ro = r + ring * (key ? 1.25 : rng.range(0.92, 1.06));
    const da = joint / r;
    const s = new THREE.Shape();
    const steps = 3;
    for (let k = 0; k <= steps; k++) {
      const a = a0 - da - ((a0 - a1 - 2 * da) * k) / steps;
      const p = [Math.cos(a) * r, Math.sin(a) * r];
      if (k === 0) s.moveTo(p[0] as number, p[1] as number);
      else s.lineTo(p[0] as number, p[1] as number);
    }
    for (let k = steps; k >= 0; k--) {
      const a = a0 - da - ((a0 - a1 - 2 * da) * k) / steps;
      // Keystone flares outward.
      const rr = key ? ro + Math.abs(k - steps / 2) * 0.02 : ro;
      s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    const g = stone(s, depth * (key ? 1.1 : rng.range(0.95, 1.05)), 0.022);
    const drop = key ? slip : 0;
    m.makeTranslation(rng.range(-0.004, 0.004), spring - drop, rng.range(-0.012, 0.012));
    g.applyMatrix4(m);
    dressed.push(clean(g));
  }

  // Spandrels: masonry between the ring and the string course.
  const extr = r + ring;
  const top = opts.top ?? spring + extr + 0.12;
  const outer = r + frame * 1.22;
  for (const side of [-1, 1]) {
    const s = new THREE.Shape();
    const x0 = side * outer;
    s.moveTo(x0, spring);
    s.lineTo(x0, top);
    s.lineTo(0, top);
    // Down along the extrados back to the springing.
    const steps = 10;
    for (let k = 0; k <= steps; k++) {
      const a = Math.PI / 2 + (side < 0 ? 1 : -1) * (k / steps) * (Math.PI / 2);
      s.lineTo(Math.cos(a) * (extr - 0.01), spring + Math.sin(a) * (extr - 0.01));
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: depth * 0.86, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -depth * 0.43);
    fill.push(clean(g));
  }

  // String course along the top (broken on damaged arches).
  if (!opts.damaged || rng.chance(0.5)) {
    let x = -outer - 0.06;
    while (x < outer + 0.06) {
      const w = Math.min(outer + 0.06 - x, rng.range(0.5, 0.8));
      const g = chamferBox(w - joint, 0.2, depth * 1.14, 0.03);
      g.applyMatrix4(m.makeTranslation(x + w / 2, top + 0.1, 0));
      dressed.push(g);
      x += w;
    }
  }

  const d = mergeGeometries(dressed.map(clean)) as THREE.BufferGeometry;
  const f = mergeGeometries(fill) as THREE.BufferGeometry;
  for (const g of [...dressed, ...fill]) g.dispose();
  return { dressed: d, fill: f };
}

/**
 * A wall pilaster at a junction of walls: moulded base, shaft, capital (and a coping cap under
 * the open sky).
 */
export function pilaster(width: number, height: number, openSky: boolean, rng: Rng, broken = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const add = (g: THREE.BufferGeometry, y: number): void => {
    g.applyMatrix4(m.makeTranslation(0, y, 0));
    parts.push(g);
  };
  const h = height - broken;
  add(chamferBox(width * 1.28, 0.22, width * 1.28, 0.04), 0.11);
  add(chamferBox(width * 1.14, 0.18, width * 1.14, 0.035), 0.31);
  // Shaft in courses.
  let y = 0.4;
  const shaftTop = openSky ? h : h - 0.42;
  while (y < shaftTop - 0.05) {
    const ch = Math.min(shaftTop - y, rng.range(0.45, 0.62));
    add(chamferBox(width * rng.range(0.99, 1.01), ch - 0.012, width * rng.range(0.99, 1.01), 0.025), y + ch / 2);
    y += ch;
  }
  if (broken > 0) {
    // Jagged broken top.
    const g = chamferBox(width * 0.7, 0.2, width * 0.6, 0.05);
    g.rotateZ(rng.range(-0.3, 0.3));
    add(g, shaftTop + 0.05);
  } else if (openSky) {
    add(chamferBox(width * 1.2, 0.14, width * 1.2, 0.03), h + 0.07);
    add(chamferBox(width * 1.32, 0.12, width * 1.32, 0.03), h + 0.2);
  } else {
    add(chamferBox(width * 1.16, 0.16, width * 1.16, 0.03), h - 0.34);
    add(chamferBox(width * 1.3, 0.2, width * 1.3, 0.035), h - 0.16);
  }
  const g = mergeGeometries(parts) as THREE.BufferGeometry;
  for (const p of parts) p.dispose();
  return g;
}

/**
 * A shallow niche frame against a wall: jambs, a round head and a sill. Its back is the wall.
 * Faces +Z, centred on x = 0, standing on y = 0.
 */
export function nicheFrame(width: number, height: number, sill: number, depth: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const jw = 0.16;
  const r = width / 2;
  const spring = sill + height - r;
  // Sill and its corbel.
  const s = chamferBox(width + jw * 2 + 0.12, 0.1, depth + 0.08, 0.025);
  s.applyMatrix4(m.makeTranslation(0, sill, (depth + 0.08) / 2));
  parts.push(s);
  const c = chamferBox(width * 0.7, 0.16, depth * 0.7, 0.03);
  c.applyMatrix4(m.makeTranslation(0, sill - 0.13, (depth * 0.7) / 2));
  parts.push(c);
  for (const side of [-1, 1]) {
    const j = chamferBox(jw, spring - sill, depth, 0.025);
    j.applyMatrix4(m.makeTranslation(side * (r + jw / 2), (sill + spring) / 2, depth / 2));
    parts.push(j);
  }
  // Round head as a ring of 5 voussoirs.
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * Math.PI + 0.01;
    const a1 = Math.PI - ((i + 1) / n) * Math.PI - 0.01;
    const sh = new THREE.Shape();
    sh.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    sh.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    sh.lineTo(Math.cos(a1) * (r + jw), Math.sin(a1) * (r + jw));
    sh.lineTo(Math.cos(a0) * (r + jw), Math.sin(a0) * (r + jw));
    sh.closePath();
    const g = clean(stone(sh, depth, 0.015));
    g.applyMatrix4(m.makeTranslation(0, spring, depth / 2));
    parts.push(g);
  }
  const g = mergeGeometries(parts.map(clean)) as THREE.BufferGeometry;
  for (const p of parts) p.dispose();
  return g;
}

/** A fallen column drum or block for rubble heaps. */
export function columnDrum(radius: number, height: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius * 1.02, height, 16, 1);
  // Fluting.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    if (rr < radius * 0.5) continue;
    const k = 1 - 0.035 * Math.max(0, Math.cos(a * 16));
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  g.computeVertexNormals();
  return clean(g);
}

/** A full column (base, fluted shaft, capital) — `broken` shortens it to a jagged stump. */
export function column(radius: number, height: number, broken = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const base = chamferBox(radius * 2.7, 0.24, radius * 2.7, 0.04);
  base.applyMatrix4(m.makeTranslation(0, 0.12, 0));
  parts.push(base);
  const torus = clean(new THREE.TorusGeometry(radius * 1.12, radius * 0.16, 6, 20));
  torus.rotateX(Math.PI / 2);
  torus.applyMatrix4(m.makeTranslation(0, 0.3, 0));
  parts.push(torus);
  const shaftH = height - broken - 0.6;
  let y = 0.32;
  const drums = Math.max(1, Math.round(shaftH / 0.9));
  for (let i = 0; i < drums; i++) {
    const h = shaftH / drums;
    const d = columnDrum(radius, h - 0.01);
    d.applyMatrix4(m.makeTranslation(0, y + h / 2, 0));
    parts.push(d);
    y += h;
  }
  if (broken === 0) {
    const neck = clean(new THREE.CylinderGeometry(radius * 1.3, radius * 1.02, 0.16, 16));
    neck.applyMatrix4(m.makeTranslation(0, y + 0.08, 0));
    parts.push(neck);
    const abacus = chamferBox(radius * 2.8, 0.2, radius * 2.8, 0.035);
    abacus.applyMatrix4(m.makeTranslation(0, y + 0.26, 0));
    parts.push(abacus);
  }
  const g = mergeGeometries(parts) as THREE.BufferGeometry;
  for (const p of parts) p.dispose();
  return g;
}
