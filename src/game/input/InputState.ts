/**
 * Unified input for keyboard, mouse (pointer lock) and touch (virtual joystick + look pad).
 * Keyboard uses physical key codes so WASD works on Hebrew (or any) keyboard layout.
 */
export class InputState {
  private readonly keys = new Set<string>();
  joyX = 0;
  joyY = 0;
  private lookDX = 0;
  private lookDY = 0;
  touchSprint = false;
  pointerLocked = false;
  lastDevice: 'keyboard' | 'touch' = 'keyboard';
  /** Edge-triggered actions (consumed once). */
  private readonly pressed = new Set<string>();

  keyDown(code: string): void {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
    this.lastDevice = 'keyboard';
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  clear(): void {
    this.keys.clear();
    this.pressed.clear();
    this.joyX = 0;
    this.joyY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumePressed(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  addLook(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  /** Movement intent in [-1, 1]: x = strafe right, y = forward. */
  move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.joyX;
    y += this.joyY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint;
  }

  get anyMovement(): boolean {
    const m = this.move();
    return Math.abs(m.x) + Math.abs(m.y) > 0.05;
  }
}

export const input = new InputState();
