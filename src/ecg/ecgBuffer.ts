/** Sliding window of pseudo-ECG samples, immutable from the outside. */
import type { EcgSample } from './EcgTrace';

export function pushSample(
  samples: readonly EcgSample[],
  sample: EcgSample,
  windowMs: number,
): readonly EcgSample[] {
  const cutoff = sample.t - windowMs;
  let drop = 0;
  while (drop < samples.length && (samples[drop]?.t ?? 0) < cutoff) drop++;
  return [...samples.slice(drop), sample];
}
