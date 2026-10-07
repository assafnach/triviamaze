import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/gameConfig';
import { clamp, damp } from '@/utils/math';
import type { InputState } from '../input/InputState';
import type { CollisionWorld } from './collision';

const P = GAME_CONFIG.player;
const MOUSE_RAD_PER_PX = 0.0022;
const TOUCH_RAD_PER_PX = 0.0052;

export interface PlayerSettings {
  mouseSensitivity: number;
  touchSensitivity: number;
  reducedMotion: boolean;
}

/**
 * First-person controller. The ONLY thing that moves the player is the player's own input
 * (plus the brief optional intro/victory cinematics driven explicitly by the game controller).
 */
export class PlayerController {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  private vx = 0;
  private vz = 0;
  private bobPhase = 0;
  private bobBlend = 0;
  private lastStepSign = 1;
  /** Total distance walked (metres). */
  distance = 0;
  onStep: (() => void) | null = null;
  /** Extra camera offsets for restrained effects (rumble, life-lost sway). */
  readonly shake = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly collision: CollisionWorld,
  ) {
    camera.rotation.order = 'YXZ';
  }

  teleport(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.vx = 0;
    this.vz = 0;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt: number, time: number, input: InputState, canMove: boolean, canLook: boolean, settings: PlayerSettings): void {
    // Look.
    const [ldx, ldy] = input.consumeLook();
    if (canLook) {
      const k = input.lastDevice === 'touch' ? TOUCH_RAD_PER_PX * settings.touchSensitivity : MOUSE_RAD_PER_PX * settings.mouseSensitivity;
      this.yaw -= ldx * k;
      this.pitch = clamp(this.pitch - ldy * k, -1.3, 1.3);
    }

    // Move.
    let tx = 0;
    let tz = 0;
    if (canMove) {
      const m = input.move();
      const speed = input.sprint ? P.sprintSpeed : P.walkSpeed;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      tx = (fx * m.y + rx * m.x) * speed;
      tz = (fz * m.y + rz * m.x) * speed;
    }
    this.vx = damp(this.vx, tx, P.acceleration, dt);
    this.vz = damp(this.vz, tz, P.acceleration, dt);
    if (Math.abs(this.vx) + Math.abs(this.vz) > 1e-4) {
      const before = { x: this.x, z: this.z };
      const r = this.collision.move(this.x, this.z, this.vx * dt, this.vz * dt, P.radius);
      this.x = r.x;
      this.z = r.z;
      const moved = Math.hypot(this.x - before.x, this.z - before.z);
      this.distance += moved;
      // Bleed velocity into walls so sliding feels natural.
      if (dt > 0) {
        this.vx = (this.x - before.x) / dt;
        this.vz = (this.z - before.z) / dt;
      }
    }

    // Head bob, breathing and footsteps (restrained; disabled with reduced motion).
    const speed = this.speed;
    this.bobBlend = damp(this.bobBlend, speed > 0.4 ? 1 : 0, 6, dt);
    this.bobPhase += dt * (4.2 + speed * 1.1);
    const stepSignal = Math.sin(this.bobPhase * 2);
    const sign = stepSignal >= 0 ? 1 : -1;
    if (sign !== this.lastStepSign && sign < 0 && speed > 0.6) this.onStep?.();
    this.lastStepSign = sign;
    let bobY = 0;
    let bobX = 0;
    if (!settings.reducedMotion) {
      bobY = stepSignal * 0.032 * this.bobBlend + Math.sin(time * 1.5) * 0.007 * (1 - this.bobBlend);
      bobX = Math.sin(this.bobPhase) * 0.018 * this.bobBlend;
    }
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.camera.position.set(this.x + rx * bobX + this.shake.x, P.eyeHeight + bobY + this.shake.y, this.z + rz * bobX + this.shake.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  /** Used only by short, explicit cinematics. */
  applyCamera(pos: THREE.Vector3, yaw: number, pitch: number): void {
    this.camera.position.copy(pos);
    this.camera.rotation.set(pitch, yaw, 0);
  }
}
