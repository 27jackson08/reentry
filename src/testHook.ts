/**
 * Exposes the simulation and controller to Playwright when the page is opened
 * with ?test=1. Not loaded otherwise.
 */
import type { AppController, TissueStatus } from './app/controller';
import type { StimulusShape } from './gpu/simulation';

export interface ReentryTestHook {
  readonly size: number;
  step(count: number): void;
  /** Run the controller's per-frame tick `frames` times (steps + probe + protocol). */
  tick(frames: number): void;
  stimulate(shape: StimulusShape, current: number, durationMs: number): void;
  shock(current: number, durationMs: number): void;
  induce(): void;
  setMask(mask: number[]): void;
  readU(): number[];
  readState(): number[];
  probe(): number[];
  timeMs(): number;
  activity(): number;
  status(): TissueStatus;
  setPreset(id: string): void;
  setStepsPerFrame(n: number): void;
  ecgSamples(): { t: number; phi: number }[];
  reset(): void;
  pause(): void;
}

export function installTestHook(app: AppController): void {
  const sim = app.sim;
  app.syncProbe = true;
  const hook: ReentryTestHook = {
    size: sim.size,
    step: (n) => sim.step(n),
    tick: (frames) => {
      const wasRunning = app.running;
      app.running = true;
      for (let i = 0; i < frames; i++) app.tick();
      app.running = wasRunning;
    },
    stimulate: (shape, current, durationMs) => sim.stimulate(shape, current, durationMs),
    shock: (current, durationMs) => sim.applyShock(current, durationMs),
    induce: () => {
      app.induce();
      app.running = false;
    },
    setMask: (mask) => sim.setMask(Uint8Array.from(mask)),
    readU: () => {
      const s = sim.readState();
      const u: number[] = new Array(sim.size * sim.size);
      for (let i = 0; i < u.length; i++) u[i] = s[i * 4] ?? 0;
      return u;
    },
    readState: () => Array.from(sim.readState()),
    probe: () => Array.from(sim.probe()),
    timeMs: () => sim.timeMs,
    activity: () => app.activity,
    status: () => app.status,
    setPreset: (id) => app.setPreset(id),
    setStepsPerFrame: (n) => {
      app.msPerFrame = n * sim.dt;
    },
    ecgSamples: () => app.ecgSamples.map((s) => ({ t: s.t, phi: s.phi })),
    reset: () => app.reset(),
    pause: () => {
      app.running = false;
    },
  };
  (window as unknown as { __reentry: ReentryTestHook }).__reentry = hook;
}
