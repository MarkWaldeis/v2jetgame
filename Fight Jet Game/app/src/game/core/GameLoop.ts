// Fixed-Timestep Game-Loop: stabile Physik unabhängig von der Framerate,
// Rendering so oft wie möglich.
export type UpdateFn = (dt: number) => void;

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private readonly step = 1 / 120; // Physik-Tick 120 Hz
  private running = false;
  private rafId = 0;
  private update: UpdateFn;
  private render: () => void;

  constructor(update: UpdateFn, render: () => void) {
    this.update = update;
    this.render = render;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      let frame = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (frame > 0.25) frame = 0.25; // Spiral-of-death-Schutz
      this.accumulator += frame;
      while (this.accumulator >= this.step) {
        this.update(this.step);
        this.accumulator -= this.step;
      }
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
