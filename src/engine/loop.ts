/**
 * Fixed-timestep game loop, decoupled from rendering.
 *
 * Why this shape (see docs/DESIGN.md §2):
 *  - Simulation advances in fixed DT steps, so the sim is DETERMINISTIC. The same
 *    elapsed time always produces the same result, which is what makes offline
 *    catch-up exact rather than approximate, and what makes the headless balance
 *    simulator trustworthy as a regression gate.
 *  - The render layer is notified at most once per animation frame, never once per
 *    tick. A catch-up burst of 5,000 ticks costs exactly one notification.
 *  - Frame time is clamped. Without the clamp, a long stall (tab backgrounded,
 *    laptop lid closed) queues an unbounded number of ticks, each of which makes
 *    the next frame later still: the "spiral of death". Ref: Gaffer On Games,
 *    "Fix Your Timestep!".
 *
 * The loop owns the truth. Nothing here knows what a component is.
 */

/** Simulation step. 20 Hz — fine enough to feel continuous, coarse enough to catch up fast. */
export const DT = 0.05;

/** Never process more than this much real time in one frame (seconds). */
const MAX_FRAME_TIME = 0.25;

/**
 * Hard ceiling on catch-up ticks in a single call. At DT=0.05 this is 60s of
 * simulation. Offline time beyond this is handled by the offline path, which
 * grants a lump sum instead of simulating hours tick-by-tick.
 */
const MAX_CATCHUP_TICKS = 1200;

export interface LoopHooks<S> {
  /** Advance the simulation by exactly `dt` seconds. Must be deterministic. */
  tick(state: S, dt: number): void;
  /** Called at most once per frame, after all ticks for that frame. */
  render(state: S): void;
  /** Wall-clock seconds. Injectable so tests and the simulator can drive time. */
  now?(): number;
}

export class GameLoop<S> {
  private accumulator = 0;
  private lastTime = 0;
  private rafId: number | null = null;
  private running = false;

  /** Ticks processed since construction. Diagnostic; also proves determinism in tests. */
  totalTicks = 0;

  constructor(
    private state: S,
    private hooks: LoopHooks<S>,
  ) {}

  private clock(): number {
    return this.hooks.now ? this.hooks.now() : performance.now() / 1000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.clock();
    this.accumulator = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private schedule(): void {
    this.rafId = requestAnimationFrame(() => {
      if (!this.running) return;
      this.frame();
      this.schedule();
    });
  }

  /**
   * One frame: consume elapsed real time into whole DT steps, then render once.
   * Exposed (not private) so tests can drive frames without a browser.
   */
  frame(): void {
    const now = this.clock();
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Clamp. A backgrounded tab must not queue ten minutes of ticks.
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
    if (frameTime < 0) frameTime = 0; // clock went backwards; ignore

    this.accumulator += frameTime;

    let ticks = 0;
    while (this.accumulator >= DT && ticks < MAX_CATCHUP_TICKS) {
      this.hooks.tick(this.state, DT);
      this.accumulator -= DT;
      ticks++;
      this.totalTicks++;
    }

    // If we hit the tick ceiling, discard the backlog rather than carrying it
    // forward forever — carrying it would make every subsequent frame overrun too.
    if (ticks >= MAX_CATCHUP_TICKS) this.accumulator = 0;

    this.hooks.render(this.state);
  }

  /**
   * Simulate a known span of time in fixed steps, without touching wall clock.
   * Used by the offline-progress path and by the headless balance simulator.
   * Returns the number of ticks actually run.
   */
  advance(seconds: number): number {
    const ticks = Math.floor(seconds / DT);
    for (let i = 0; i < ticks; i++) {
      this.hooks.tick(this.state, DT);
      this.totalTicks++;
    }
    return ticks;
  }
}
