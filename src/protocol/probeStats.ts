/** Pure helpers over the probe readback: [mean u, max u, mean v, tissue count] per texel. */

export function probeIndex(x: number, y: number, size: number): number {
  const i = Math.min(size - 1, Math.max(0, Math.floor(x * size)));
  const j = Math.min(size - 1, Math.max(0, Math.floor(y * size)));
  return j * size + i;
}

export function probeMeanU(probe: Float32Array, size: number, x: number, y: number): number {
  return probe[probeIndex(x, y, size) * 4] ?? 0;
}

/** Fraction of tissue texels whose peak u in the block exceeds `threshold`. */
export function activeFraction(probe: Float32Array, size: number, threshold: number): number {
  let tissue = 0;
  let active = 0;
  for (let k = 0; k < size * size; k++) {
    if ((probe[k * 4 + 3] ?? 0) <= 0) continue;
    tissue++;
    if ((probe[k * 4 + 1] ?? 0) > threshold) active++;
  }
  return tissue === 0 ? 0 : active / tissue;
}
