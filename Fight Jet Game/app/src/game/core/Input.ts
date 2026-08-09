// Input: Tastatur + Maus für War Thunder Mouse-Aim / Manual Override / Free-Look.

export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();

  // Achsenwerte -1..1 (Manual Stick)
  pitch = 0;
  roll = 0;
  yaw = 0;
  throttle = 0.6; // 0..1  (WEP = afterburner, ~110%)
  afterburner = false;
  airbrake = false;
  cannon = false;

  // --- Mouse-Aim (Virtual Aim Point in NDC, -1..1) ---
  /** Horizontaler Aim-Cursor (Bildschirm, NDC) */
  aimX = 0;
  /** Vertikaler Aim-Cursor (Bildschirm, NDC; + = oben) */
  aimY = 0;
  /** True solange WASD/QE/Pfeile gedrückt → Manual Override */
  manualOverride = false;
  /** Mouse-Aim aktiv (nicht Free-Look, nicht Override) */
  mouseAimActive = true;

  // Free-Look (halten)
  freeLookHeld = false;
  rightMouse = false;

  // Maus-Delta (Pixel/Frame) für Free-Look
  mouseDX = 0;
  mouseDY = 0;
  private accumMX = 0;
  private accumMY = 0;

  // Canvas-relativ für Aim ohne Pointer-Lock
  private canvas: HTMLElement | null = null;
  private pointerLocked = false;

  constructor(canvas?: HTMLElement) {
    this.canvas = canvas ?? null;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onPointerLock);
  }

  setCanvas(el: HTMLElement) {
    this.canvas = el;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.rightMouse = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    this.accumMX += e.movementX;
    this.accumMY += e.movementY;

    // Ohne Pointer-Lock: absolute Cursor-Position → Aim-Reticle
    if (!this.pointerLocked && this.canvas && !this.freeLookHeld) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.aimX = Math.max(-1, Math.min(1, nx));
        this.aimY = Math.max(-1, Math.min(1, ny));
      }
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 2) {
      this.rightMouse = true;
      e.preventDefault();
    }
    // LMB: optional Pointer-Lock für reines Delta-Aim (wie WT)
    if (e.button === 0 && this.canvas && e.target === this.canvas) {
      // nicht erzwingen — absolute Maus funktioniert auch
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) this.rightMouse = false;
  };

  private onWheel = (e: WheelEvent) => {
    // Mausrad = Throttle
    if (Math.abs(e.deltaY) < 0.1) return;
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.06 : 0.06;
    this.throttle = Math.max(0, Math.min(1, this.throttle + step));
  };

  private onPointerLock = () => {
    this.pointerLocked = document.pointerLockElement != null;
  };

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.accumMX = 0;
    this.accumMY = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  update(dt: number, opts?: { freeLook?: boolean; playing?: boolean }) {
    const k = this.keys;
    const free = opts?.freeLook ?? false;

    // --- Manual Stick ---
    // W = Pitch Down, S = Pitch Up (WT: S = max G-Pull)
    // Intern: +pitch = Nase hoch
    this.pitch =
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) -
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    this.roll =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.yaw = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);

    this.manualOverride =
      Math.abs(this.pitch) > 0.01 ||
      Math.abs(this.roll) > 0.01 ||
      Math.abs(this.yaw) > 0.01;

    // Free-Look: C halten oder RMB
    this.freeLookHeld = k.has('KeyC') || this.rightMouse;

    // Mouse-Aim nur wenn spielend, nicht Free-Look, nicht Manual Override
    this.mouseAimActive =
      (opts?.playing ?? true) && !free && !this.freeLookHeld && !this.manualOverride;

    // Pointer-Lock: Aim mit relative Deltas
    if (this.pointerLocked && !free && !this.freeLookHeld) {
      // CONFIG-ähnliche Sensitivität inline (Input kennt CONFIG nicht zwingend — hardcode safe)
      const sens = 0.00135;
      this.aimX = Math.max(-0.92, Math.min(0.92, this.aimX + this.accumMX * sens));
      this.aimY = Math.max(-0.92, Math.min(0.92, this.aimY - this.accumMY * sens));
    }

    const throttleUp = k.has('ShiftLeft') || k.has('ShiftRight');
    const throttleDown = k.has('ControlLeft') || k.has('ControlRight');
    if (throttleUp) this.throttle = Math.min(1, this.throttle + dt * 0.7);
    if (throttleDown) this.throttle = Math.max(0, this.throttle - dt * 0.7);

    // WEP / Afterburner: Tab oder Vollgas
    this.afterburner = k.has('Tab') || this.throttle >= 0.99;
    this.airbrake = k.has('KeyB');
    this.cannon = k.has('Space');

    this.mouseDX = this.accumMX;
    this.mouseDY = this.accumMY;
    this.accumMX = 0;
    this.accumMY = 0;
  }

  freeLookDelta(dt: number): { x: number; y: number } {
    const keySpeed = 1.8;
    let x = this.mouseDX;
    let y = this.mouseDY;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyJ')) x -= keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyL')) x += keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyI')) y -= keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyK')) y += keySpeed * 60 * dt * 16;
    return { x, y };
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
  }
}
