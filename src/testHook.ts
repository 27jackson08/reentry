/**
 * Exposes the simulation to Playwright when the page is opened with ?test=1.
 * Not loaded otherwise.
 */
import type { Simulation, StimulusShape } from './gpu/simulation';

export interface ReentryTestHook {
  readonly size: number;
  step(count: number): void;
  stimulate(shape: StimulusShape, current: number, durationMs: number): void;
  shock(current: number, durationMs: number): void;
  setMask(mask: number[]): void;
  readU(): number[];
  readState(): number[];
  probe(): number[];
  timeMs(): number;
  setPreset(id: string): void;
  reset(): void;
  pause(): void;
}

export function installTestHook(
  sim: Simulation,
  setPreset: (id: string) => void,
  pause: () => void,
): void {
  const hook: ReentryTestHook = {
    size: sim.size,
    step: (n) => sim.step(n),
    stimulate: (shape, current, durationMs) => sim.stimulate(shape, current, durationMs),
    shock: (current, durationMs) => sim.applyShock(current, durationMs),
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
    setPreset,
    reset: () => sim.reset(),
    pause,
  };
  (window as unknown as { __reentry: ReentryTestHook }).__reentry = hook;
}
