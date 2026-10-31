/**
 * Phase singularities (rotor tips) on the probe grid.
 *
 * Phase comes from a time-delay embedding of the voltage, θ = atan2(u(t−τ) − c,
 * u(t) − c), the construction used for optical-mapping data (Bray & Wikswo).
 * Around each 2×2 plaquette the wrapped phase differences sum to 0 for ordinary
 * tissue and to ±2π around a rotor tip. τ = 40 ms and c = 0.45 were chosen on
 * recorded probes: stable rotors count exactly one, fibrillation counts many.
 * Probe layout per cell: [mean u, max u, mean v, tissue count].
 */

export interface Singularity {
  /** uv coordinates of the plaquette centre. */
  readonly x: number;
  readonly y: number;
  /** +1 or -1: sense of rotation. */
  readonly charge: 1 | -1;
}

export const PHASE_DELAY_MS = 40;
const CHANNELS = 4;
const PHASE_ORIGIN = 0.45;
const TWO_PI = 2 * Math.PI;
/** Cells this close to the phase origin have an ill-defined phase; skip plaquettes containing them. */
const MIN_RADIUS = 0.05;

export function phaseOf(uNow: number, uPast: number): number {
  return Math.atan2(uPast - PHASE_ORIGIN, uNow - PHASE_ORIGIN);
}

function wrap(d: number): number {
  return d - TWO_PI * Math.round(d / TWO_PI);
}

/** `probe` is the current readback; `uPast` holds mean u per cell from PHASE_DELAY_MS earlier. */
export function findPhaseSingularities(
  probe: Float32Array,
  uPast: Float32Array,
  size: number,
): Singularity[] {
  const phase = new Float32Array(size * size);
  const valid = new Uint8Array(size * size);
  for (let k = 0; k < size * size; k++) {
    const uNow = probe[k * CHANNELS] ?? 0;
    const past = uPast[k] ?? 0;
    const tissue = (probe[k * CHANNELS + 3] ?? 0) > 0;
    const radius = Math.hypot(uNow - PHASE_ORIGIN, past - PHASE_ORIGIN);
    valid[k] = tissue && radius > MIN_RADIUS ? 1 : 0;
    phase[k] = phaseOf(uNow, past);
  }
  const out: Singularity[] = [];
  for (let j = 0; j < size - 1; j++) {
    for (let i = 0; i < size - 1; i++) {
      const a = j * size + i;
      const b = a + 1;
      const c = a + size + 1;
      const d = a + size;
      if (!(valid[a] && valid[b] && valid[c] && valid[d])) continue;
      const winding =
        wrap(phase[b]! - phase[a]!) +
        wrap(phase[c]! - phase[b]!) +
        wrap(phase[d]! - phase[c]!) +
        wrap(phase[a]! - phase[d]!);
      if (Math.abs(winding) < Math.PI) continue;
      out.push({ x: (i + 1) / size, y: (j + 1) / size, charge: winding > 0 ? 1 : -1 });
    }
  }
  return out;
}

/** Singularities closer than this (in probe cells) are one tip, or a spurious pair. */
export const MERGE_RADIUS_CELLS = 2.5;

/**
 * A rotor core on a coarse grid often registers as a small cluster: the true
 * tip plus a nearby ±1 pair. Opposite charges within MERGE_RADIUS_CELLS
 * annihilate; same charges collapse to one. Returns a new list.
 */
export function mergeSingularities(found: readonly Singularity[], size: number): Singularity[] {
  const radius = MERGE_RADIUS_CELLS / size;
  let items: Singularity[] = [...found];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) > radius) continue;
        const rest = items.filter((_, k) => k !== i && k !== j);
        items =
          a.charge === b.charge
            ? [...rest, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, charge: a.charge }]
            : rest;
        merged = true;
        break outer;
      }
    }
  }
  return items;
}

/** Copy the mean-u channel out of a probe readback (the readback buffer is reused). */
export function extractU(probe: Float32Array, size: number): Float32Array {
  const u = new Float32Array(size * size);
  for (let k = 0; k < size * size; k++) u[k] = probe[k * CHANNELS] ?? 0;
  return u;
}
