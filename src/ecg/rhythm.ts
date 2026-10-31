/**
 * Dominant cycle length and regularity of the pseudo-ECG, from the
 * autocorrelation of the last window. A stable rotor gives a sharp peak
 * (regular tachycardia); fibrillation gives a weak, broad one (irregular).
 */
import type { EcgSample } from './EcgTrace';

export interface Rhythm {
  readonly cycleMs: number;
  /** Autocorrelation at the dominant lag, 0..1. Above ~0.7 reads as regular. */
  readonly regularity: number;
}

const RESAMPLE_MS = 4;
const MIN_WINDOW_MS = 600;
const MIN_LAG_MS = 40;
const MAX_LAG_MS = 800;
const MIN_AMPLITUDE = 1e-6;
const MIN_PEAK = 0.2;
const HARMONIC_TOLERANCE = 0.85;

export function analyzeRhythm(samples: readonly EcgSample[]): Rhythm | null {
  if (samples.length < 2) return null;
  const t0 = samples[0]!.t;
  const t1 = samples[samples.length - 1]!.t;
  if (t1 - t0 < MIN_WINDOW_MS) return null;

  const x = resample(samples, t0, t1);
  const n = x.length;
  let mean = 0;
  for (const v of x) mean += v;
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    x[i] = (x[i] ?? 0) - mean;
    energy += (x[i] ?? 0) ** 2;
  }
  if (energy / n < MIN_AMPLITUDE * MIN_AMPLITUDE) return null;

  const minLag = Math.round(MIN_LAG_MS / RESAMPLE_MS);
  const maxLag = Math.min(Math.round(MAX_LAG_MS / RESAMPLE_MS), Math.floor(n / 2));
  const acf: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += (x[i] ?? 0) * (x[i + lag] ?? 0);
    acf.push(acc / (energy * (1 - lag / n)));
  }
  // Local maxima of the autocorrelation; harmonics at 2T, 3T are as tall as the
  // peak at T, so take the earliest one within reach of the tallest.
  const peaks: { lag: number; value: number }[] = [];
  for (let i = 1; i < acf.length - 1; i++) {
    const v = acf[i] ?? 0;
    if (v > (acf[i - 1] ?? 0) && v >= (acf[i + 1] ?? 0)) peaks.push({ lag: minLag + i, value: v });
  }
  if (peaks.length === 0) return null;
  const tallest = Math.max(...peaks.map((p) => p.value));
  if (tallest < MIN_PEAK) return null;
  const first = peaks.find((p) => p.value >= HARMONIC_TOLERANCE * tallest)!;
  return { cycleMs: first.lag * RESAMPLE_MS, regularity: Math.min(1, first.value) };
}

function resample(samples: readonly EcgSample[], t0: number, t1: number): number[] {
  const out: number[] = [];
  let k = 0;
  for (let t = t0; t <= t1; t += RESAMPLE_MS) {
    while (k + 1 < samples.length && samples[k + 1]!.t <= t) k++;
    const a = samples[k]!;
    const b = samples[Math.min(k + 1, samples.length - 1)]!;
    const span = b.t - a.t;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    out.push(a.phi + (b.phi - a.phi) * f);
  }
  return out;
}
