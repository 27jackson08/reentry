/** Pure measurements on simulated traces: APD, restitution. */
import { REST, stepCell, type CellState, type FkParams } from './fentonKarma';

export interface Trace {
  readonly t: readonly number[];
  readonly u: readonly number[];
}

/**
 * Action potential duration at `fraction` repolarization (0.9 → APD90) of the
 * first upstroke in the trace. Returns null if no action potential is present.
 */
export function apd(trace: Trace, fraction: number): number | null {
  const { t, u } = trace;
  let peak = 0;
  for (const x of u) peak = Math.max(peak, x);
  if (peak < 0.5) return null;
  const threshold = peak * (1 - fraction);
  const start = u.findIndex((x) => x > threshold);
  if (start < 0) return null;
  for (let i = start + 1; i < u.length; i++) {
    if ((u[i] ?? 0) <= threshold) return (t[i] ?? 0) - (t[start] ?? 0);
  }
  return null;
}

const STIM_CURRENT = 0.5;
const STIM_DURATION_MS = 2;

/** Run one cell from rest with a 2 ms stimulus and return its voltage trace. */
export function singleCellTrace(
  p: FkParams,
  dt: number,
  durationMs: number,
  initial: CellState = REST,
): Trace {
  const t: number[] = [];
  const u: number[] = [];
  let s = initial;
  const steps = Math.round(durationMs / dt);
  for (let i = 0; i <= steps; i++) {
    const time = i * dt;
    t.push(time);
    u.push(s.u);
    const stim = time < STIM_DURATION_MS ? STIM_CURRENT : 0;
    s = stepCell(s, p, dt, stim);
  }
  return { t, u };
}

export interface RestitutionPoint {
  readonly di: number;
  readonly apd: number;
}

const CONDITIONING_BEATS = 4;
const CONDITIONING_CL_MS = 1000;
const RECOVERY_THRESHOLD = 0.1;

/**
 * S1-S2 restitution: pace a cell at a 1 s cycle length, then deliver S2 at a
 * chosen diastolic interval after APD90 of the last S1 and measure APD90 of S2.
 */
export function restitutionCurve(
  p: FkParams,
  dt: number,
  diastolicIntervals: readonly number[],
): RestitutionPoint[] {
  return diastolicIntervals.map((di) => {
    let s = REST;
    let t = 0;
    // Conditioning beats at a fixed cycle length.
    for (let beat = 0; beat < CONDITIONING_BEATS - 1; beat++) {
      const start = t;
      while (t < start + CONDITIONING_CL_MS) {
        const stim = t - start < STIM_DURATION_MS ? STIM_CURRENT : 0;
        s = stepCell(s, p, dt, stim);
        t += dt;
      }
    }
    // Final S1: run until the cell has fired and repolarized, then wait DI.
    const start = t;
    let fired = false;
    while (!(fired && s.u < RECOVERY_THRESHOLD) && t < start + CONDITIONING_CL_MS) {
      const stim = t - start < STIM_DURATION_MS ? STIM_CURRENT : 0;
      s = stepCell(s, p, dt, stim);
      t += dt;
      if (s.u > 0.5) fired = true;
    }
    const s2Time = t + di;
    while (t < s2Time) {
      s = stepCell(s, p, dt);
      t += dt;
    }
    const trace = singleCellTrace(p, dt, 1000, s);
    return { di, apd: apd(trace, 0.9) ?? 0 };
  });
}
