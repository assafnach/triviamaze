import * as THREE from 'three';
import { damp, dampAngle, wrapAngle } from '@/utils/math';
import { tickDetailMaterial } from '../render/detailShader';
import type { SkinnedRig } from './rig';

export type CreatureMood = 'idle' | 'notice' | 'talk' | 'happy' | 'sad' | 'point' | 'aloof';

type Offsets = Map<string, [number, number, number]>;

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

/**
 * Drives a sculpted, skinned creature with layered procedural animation:
 * breathing, weight shifts, gaze tracking, blinking, gestures, emotional reactions,
 * walking to the revealed doorway (or flying there) and physically pointing at it.
 * Nothing here ever moves the player.
 */
export class Creature {
  readonly rig: SkinnedRig;
  readonly home: THREE.Vector3;
  readonly homeYaw: number;
  mood: CreatureMood = 'idle';
  speaking = false;
  lookTarget: THREE.Vector3 | null = null;
  pointTarget: THREE.Vector3 | null = null;
  private moodTime = 0;
  private yaw: number;
  private readonly position = new THREE.Vector3();
  private readonly seed = Math.random() * 100;
  private blinkTimer = 1.5 + Math.random() * 3;
  private blinkPhase = 0;
  private walkPhase = 0;
  private walkTarget: THREE.Vector3 | null = null;
  private flight: THREE.Vector3[] | null = null;
  private flightT = 0;
  private bounce = 0;
  private twitch = 0;
  private readonly offsets: Offsets = new Map();
  private readonly hipsRestY: number;

  constructor(rig: SkinnedRig, home: THREE.Vector3, homeYaw: number) {
    this.rig = rig;
    this.home = home.clone();
    this.homeYaw = homeYaw;
    this.yaw = homeYaw;
    this.position.copy(home);
    // Perched birds start on their perch, hovering flyers at their hover height.
    if (rig.perch || rig.flying) this.position.y = rig.hoverHeight;
    rig.root.position.copy(this.position);
    rig.root.rotation.y = homeYaw;
    this.hipsRestY = rig.bones.get('hips')?.position.y ?? 0;
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  setMood(mood: CreatureMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodTime = 0;
    if (mood === 'point' && this.pointTarget) {
      if (this.rig.flying) {
        const start = this.position.clone().setY(Math.max(this.rig.hoverHeight, this.rig.height * 0.6));
        const end = this.pointTarget.clone().setY(2.4);
        const mid = start.clone().lerp(end, 0.5);
        mid.y += 0.8;
        this.flight = [start, mid, end];
        this.flightT = 0;
      } else if (this.rig.walkSpeed > 0) {
        // Walk a few steps toward the doorway (staying well inside the junction), then point.
        tmpV.subVectors(this.pointTarget, this.home).setY(0);
        const dist = tmpV.length();
        const step = Math.min(1.1, Math.max(0, dist - 1.4));
        this.walkTarget = step > 0.15 ? this.home.clone().addScaledVector(tmpV.normalize(), step) : null;
      }
    }
    if (mood !== 'point') this.flight = null;
  }

  /** Back to the home spot once the revealed route has faded. */
  returnHome(): void {
    this.pointTarget = null;
    this.flight = null;
    this.walkTarget = this.position.distanceTo(this.home) > 0.1 ? this.home.clone() : null;
    this.setMood('idle');
  }

  private set(name: string, x: number, y = 0, z = 0): void {
    const o = this.offsets.get(name);
    if (o) {
      o[0] += x;
      o[1] += y;
      o[2] += z;
    } else this.offsets.set(name, [x, y, z]);
  }

  private bone(name: string): THREE.Bone | undefined {
    return this.rig.bones.get(name);
  }

  update(dt: number, t: number, reducedMotion: boolean): void {
    this.moodTime += dt;
    const r = this.rig;
    const mt = this.moodTime;
    const calm = reducedMotion ? 0.35 : 1;
    this.offsets.clear();

    // ── Locomotion: walk or fly toward/away from the doorway ──
    let moving = 0;
    const flyingAway = !!(this.flight && this.mood === 'point');
    if (flyingAway) {
      this.flightT = Math.min(1, this.flightT + dt * 0.55);
      const e = 1 - (1 - this.flightT) ** 3;
      const [a, b, c] = this.flight as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      this.position.copy(a.clone().lerp(b, e).lerp(b.clone().lerp(c, e), e));
    } else if (this.walkTarget) {
      tmpV.subVectors(this.walkTarget, this.position).setY(0);
      const d = tmpV.length();
      if (d < 0.04) {
        this.walkTarget = null;
      } else {
        const stepLen = Math.min(d, r.walkSpeed * dt);
        this.position.addScaledVector(tmpV.normalize(), stepLen);
        moving = 1;
        this.walkPhase += (stepLen / Math.max(0.2, r.height * 0.35)) * Math.PI;
      }
    } else if (r.flying && !r.perch) {
      this.position.x = damp(this.position.x, this.home.x, 2, dt);
      this.position.z = damp(this.position.z, this.home.z, 2, dt);
      this.position.y = r.hoverHeight + Math.sin(t * 2.2 + this.seed) * 0.06 * calm;
    } else if (r.perch) {
      this.position.x = damp(this.position.x, this.home.x, 2, dt);
      this.position.z = damp(this.position.z, this.home.z, 2, dt);
      // Perched birds rest on top of their perch.
      this.position.y = damp(this.position.y, r.hoverHeight, 3, dt);
    }

    // ── Facing ──
    let targetYaw = this.homeYaw;
    if (moving && this.walkTarget) {
      tmpV.subVectors(this.walkTarget, this.position);
      targetYaw = Math.atan2(tmpV.x, tmpV.z);
    } else if (this.mood === 'point' && this.pointTarget) {
      tmpV.subVectors(this.pointTarget, this.position);
      targetYaw = Math.atan2(tmpV.x, tmpV.z);
    } else if (this.mood === 'aloof') {
      targetYaw = this.homeYaw + Math.PI * 0.55;
    } else if (this.lookTarget) {
      tmpV.subVectors(this.lookTarget, this.position);
      targetYaw = Math.atan2(tmpV.x, tmpV.z);
    }
    this.yaw = dampAngle(this.yaw, targetYaw, moving ? 6 : this.mood === 'point' ? 4 : 2.5, dt);
    r.root.rotation.y = this.yaw;
    r.root.position.copy(this.position);
    if (r.perch) {
      const away = flyingAway || this.position.distanceTo(this.home) > 0.05;
      r.perch.position.set(this.home.x - this.position.x, -this.position.y, this.home.z - this.position.z).applyAxisAngle(UP, -this.yaw);
      r.perch.rotation.y = away ? this.homeYaw - this.yaw : 0;
      if (!away) r.perch.position.set(0, -this.position.y, 0);
    }

    // ── Posture layer: each species' characteristic stance ──
    if (r.posture) for (const [name, o] of Object.entries(r.posture)) this.set(name, o[0], o[1], o[2]);

    // ── Base layer: breathing, weight shift, idle sway ──
    const breath = Math.sin(t * 1.7 + this.seed);
    this.set('chest', breath * 0.025 * calm);
    this.set('spine', breath * 0.012 * calm, 0, Math.sin(t * 0.55 + this.seed) * 0.025 * calm);
    this.set('hips', 0, Math.sin(t * 0.4 + this.seed) * 0.04 * calm, -Math.sin(t * 0.55 + this.seed) * 0.03 * calm);
    for (const s of ['L', 'R'] as const) {
      const sg = s === 'L' ? 1 : -1;
      this.set(`upperArm${s}`, Math.sin(t * 0.9 + this.seed + sg) * 0.04 * calm, 0, sg * 0.08);
      this.set(`foreArm${s}`, -0.18 - Math.sin(t * 0.7 + sg) * 0.04 * calm);
    }
    // Tails and ears.
    for (let i = 0; i < 8; i++) {
      if (!this.bone(`tail${i}`)) break;
      this.set(`tail${i}`, Math.sin(t * 1.1 - i * 0.5) * 0.05 * calm, Math.sin(t * 1.6 - i * 0.6 + this.seed) * 0.18 * calm);
    }
    this.twitch = Math.max(0, this.twitch - dt * 4);
    if (Math.random() < dt * 0.25) this.twitch = 1;
    this.set('earL', 0, 0, Math.sin(t * 30) * 0.12 * this.twitch * calm);
    this.set('earR', 0, 0, -Math.sin(t * 30 + 1) * 0.12 * this.twitch * calm);

    // ── Mood layer ──
    let headPitch = 0;
    let headRoll = 0;
    this.bounce = 0;
    if (this.mood === 'notice') {
      const k = Math.sin(Math.min(mt, 0.7) * (Math.PI / 0.7));
      this.set('chest', -0.18 * k);
      headPitch -= 0.25 * k;
      this.bounce = k * 0.05;
      if (mt > 1.0) this.setMood('idle');
    } else if (this.mood === 'talk' || this.speaking) {
      headPitch += Math.sin(t * 8.5) * 0.06 * calm;
      this.set('upperArmR', -0.55 - Math.sin(t * 2.3) * 0.25 * calm, 0.2, -0.15);
      this.set('foreArmR', -0.7 + Math.sin(t * 3.1) * 0.25 * calm);
      this.set('handR', Math.sin(t * 4) * 0.2 * calm);
      this.set('jaw', Math.max(0, Math.sin(t * 13)) * 0.18 * calm);
    } else if (this.mood === 'happy') {
      const up = Math.min(1, mt * 3);
      this.set('upperArmL', -0.4 * up, 0, 1.5 * up);
      this.set('upperArmR', -0.4 * up, 0, -1.5 * up);
      this.set('foreArmL', 0, 0, 0.6 * up);
      this.set('foreArmR', 0, 0, -0.6 * up);
      headRoll = Math.sin(mt * 6) * 0.15 * calm;
      headPitch -= 0.15;
      this.bounce = Math.abs(Math.sin(mt * 7)) * 0.07 * Math.max(0, 1 - mt / 2.2) * calm;
      for (let i = 0; i < 8; i++) if (this.bone(`tail${i}`)) this.set(`tail${i}`, 0, Math.sin(t * 9 - i) * 0.35 * calm);
    } else if (this.mood === 'sad') {
      const k = Math.min(1, mt * 2);
      this.set('neck', 0.3 * k);
      headPitch += 0.35 * k;
      this.set('chest', 0.2 * k);
      this.set('upperArmL', 0.15 * k, 0, -0.05 * k);
      this.set('upperArmR', 0.15 * k, 0, 0.05 * k);
      this.set('earL', 0.3 * k, 0, -0.5 * k);
      this.set('earR', 0.3 * k, 0, 0.5 * k);
      if (mt > 2.8) this.setMood('aloof');
    } else if (this.mood === 'aloof') {
      const k = Math.min(1, mt * 1.5);
      // Arms folded, chin up: "you'll have to find it yourself".
      this.set('upperArmL', -0.75 * k, 0, -0.35 * k);
      this.set('upperArmR', -0.75 * k, 0, 0.35 * k);
      this.set('foreArmL', -1.4 * k, -0.6 * k);
      this.set('foreArmR', -1.4 * k, 0.6 * k);
      headPitch -= 0.12 * k;
    }

    // Walk cycle (bipeds and quadrupeds).
    if (moving) {
      const p = this.walkPhase;
      const quad = r.gait === 'quadruped';
      this.set('thighL', Math.sin(p) * 0.55);
      this.set('thighR', -Math.sin(p) * 0.55);
      this.set('shinL', Math.max(0, -Math.sin(p - 0.7)) * 0.9);
      this.set('shinR', Math.max(0, Math.sin(p - 0.7)) * 0.9);
      if (quad) {
        this.set('upperArmL', -Math.sin(p) * 0.5);
        this.set('upperArmR', Math.sin(p) * 0.5);
        this.set('foreArmL', -Math.max(0, Math.sin(p + 0.7)) * 0.7);
        this.set('foreArmR', -Math.max(0, -Math.sin(p + 0.7)) * 0.7);
      } else {
        this.set('upperArmL', -Math.sin(p) * 0.35);
        this.set('upperArmR', Math.sin(p) * 0.35);
      }
      this.bounce += Math.abs(Math.cos(p)) * 0.025;
    }

    // Wings: fast flaps in flight or joy, folded otherwise.
    if (this.bone('wingL')) {
      const inAir = flyingAway && this.flightT < 1;
      const fast = inAir || this.mood === 'happy' || (r.flying && !r.perch);
      const f = fast ? 16 : 1.5;
      const amp = fast ? 0.75 : 0.05;
      const flap = Math.sin(t * f + this.seed) * amp * calm;
      this.set('wingL', 0, 0, flap);
      this.set('wingR', 0, 0, -flap);
    }

    // ── Apply layered pose ──
    const blend = 1 - Math.exp(-10 * dt);
    for (const [name, b] of r.bones) {
      const rest = r.rest.get(b);
      if (!rest) continue;
      const o = this.offsets.get(name);
      if (o) tmpQ.setFromEuler(tmpE.set(o[0], o[1], o[2], 'XYZ'));
      else tmpQ.identity();
      tmpQ2.copy(rest).multiply(tmpQ);
      b.quaternion.slerp(tmpQ2, blend);
    }
    const hips = this.bone('hips');
    if (hips) hips.position.y = damp(hips.position.y, this.hipsRestY - (r.postureDrop ?? 0) + this.bounce, 12, dt);

    // ── Gaze & pointing need world matrices of the posed body ──
    r.root.updateMatrixWorld(true);
    const look = this.mood === 'point' && this.pointTarget ? tmpV2.copy(this.pointTarget).setY(1.4) : this.mood === 'aloof' ? null : this.lookTarget;
    this.aimHead(look, headPitch, headRoll, dt, t, calm);
    if (this.mood === 'point' && this.pointTarget && !moving && !flyingAway) this.aimLimb(this.pointTarget, dt);

    // ── Blink ──
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkPhase = 0.13;
      this.blinkTimer = 2 + Math.random() * 4;
    }
    if (this.blinkPhase > 0) this.blinkPhase -= dt;
    const lid = this.mood === 'sad' ? 0.6 : this.blinkPhase > 0 ? 0.1 : 1;
    for (const e of r.eyes) e.scale.y = damp(e.scale.y, lid, 30, dt);

    // ── Glow responds to mood ──
    const glowLevel = this.mood === 'happy' || this.mood === 'point' ? 1.8 : this.mood === 'sad' || this.mood === 'aloof' ? 0.5 : 1;
    for (const m of r.glowMats) {
      const base = (m.userData.baseEmissive as number | undefined) ?? m.emissiveIntensity;
      m.userData.baseEmissive = base;
      m.emissiveIntensity = damp(m.emissiveIntensity, base * glowLevel, 3, dt);
    }
    for (const m of r.detailMats) tickDetailMaterial(m, t);
    r.extra?.(t, dt, glowLevel);
  }

  /** Turn neck and head toward a point, within comfortable limits. */
  private aimHead(target: THREE.Vector3 | null, extraPitch: number, roll: number, dt: number, t: number, calm: number): void {
    const head = this.bone('head');
    const neck = this.bone('neck');
    if (!head) return;
    let yaw = Math.sin(t * 0.35 + this.seed) * 0.35 * calm;
    let pitch = 0;
    if (target) {
      const parent = head.parent as THREE.Object3D;
      head.getWorldPosition(tmpV);
      tmpV.subVectors(target, tmpV);
      parent.getWorldQuaternion(tmpQ).invert();
      tmpV.applyQuaternion(tmpQ);
      yaw = THREE.MathUtils.clamp(Math.atan2(tmpV.x, tmpV.z), -1.0, 1.0);
      pitch = THREE.MathUtils.clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.5, 0.5);
    }
    pitch += extraPitch;
    const k = 1 - Math.exp(-6 * dt);
    const restH = this.rig.rest.get(head) as THREE.Quaternion;
    tmpQ.setFromEuler(tmpE.set(pitch * 0.65, yaw * 0.65, roll, 'YXZ'));
    head.quaternion.slerp(tmpQ2.copy(restH).multiply(tmpQ), k);
    if (neck) {
      const restN = this.rig.rest.get(neck) as THREE.Quaternion;
      const o = this.offsets.get('neck') ?? [0, 0, 0];
      tmpQ.setFromEuler(tmpE.set(pitch * 0.35 + o[0], yaw * 0.35, 0, 'YXZ'));
      neck.quaternion.slerp(tmpQ2.copy(restN).multiply(tmpQ), k);
    }
  }

  /** Physically point the arm (or snout/wing/tail) at the revealed doorway. */
  private aimLimb(target: THREE.Vector3, dt: number): void {
    const r = this.rig;
    const name = r.pointWith === 'armR' ? 'upperArmR' : r.pointWith === 'armL' ? 'upperArmL' : r.pointWith === 'wing' ? 'wingR' : r.pointWith === 'tail' ? 'tail0' : null;
    if (!name) return;
    const b = this.bone(name);
    if (!b || !b.parent) return;
    const child = b.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
    if (!child) return;
    // Rest direction of the limb in its parent's space.
    const restDir = child.position.clone().normalize().applyQuaternion(r.rest.get(b) as THREE.Quaternion);
    b.getWorldPosition(tmpV);
    const aim = tmpV2.copy(target).setY(Math.max(1.2, tmpV.y + 0.15)).sub(tmpV).normalize();
    b.parent.getWorldQuaternion(tmpQ).invert();
    aim.applyQuaternion(tmpQ);
    tmpQ.setFromUnitVectors(restDir, aim);
    tmpQ2.copy(tmpQ).multiply(r.rest.get(b) as THREE.Quaternion);
    b.quaternion.slerp(tmpQ2, 1 - Math.exp(-7 * dt));
    // Straighten the forearm so the gesture reads clearly.
    if (r.pointWith === 'armR' || r.pointWith === 'armL') {
      const fore = this.bone(r.pointWith === 'armR' ? 'foreArmR' : 'foreArmL');
      if (fore) fore.quaternion.slerp(r.rest.get(fore) as THREE.Quaternion, 1 - Math.exp(-7 * dt));
    }
  }

  /** Distance from home (used to move the creature's collider while it walks). */
  get offsetFromHome(): number {
    return Math.hypot(this.position.x - this.home.x, this.position.z - this.home.z);
  }

  get facing(): number {
    return wrapAngle(this.yaw);
  }

  dispose(): void {
    for (const d of this.rig.disposables) d.dispose();
    this.rig.root.removeFromParent();
  }
}
