/**
 * Pseudo-ECG from the probe grid.
 *
 * For a monodomain sheet the extracellular potential at an electrode r_e is,
 * up to a constant, φ = −∫ ∇u · ∇(1/|r − r_e|) dA  (Plonsey & Barr).
 * Here u is the dimensionless voltage averaged into probe texels, gradients are
 * central differences, and the integral is a sum over tissue texels.
 */

export interface Electrode {
  /** uv position over the sheet. */
  readonly x: number;
  readonly y: number;
  readonly heightCm: number;
}

const CHANNELS = 4;

export function pseudoEcg(
  probe: Float32Array,
  size: number,
  sideCm: number,
  electrode: Electrode,
): number {
  const h = sideCm / size;
  const ex = electrode.x * sideCm;
  const ey = electrode.y * sideCm;
  const ez = electrode.heightCm;
  const u = (i: number, j: number) => probe[(j * size + i) * CHANNELS] ?? 0;
  const isTissue = (i: number, j: number) => (probe[(j * size + i) * CHANNELS + 3] ?? 0) > 0;
  let phi = 0;
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      if (!isTissue(i, j)) continue;
      const ux = (u(i + 1, j) - u(i - 1, j)) / (2 * h);
      const uy = (u(i, j + 1) - u(i, j - 1)) / (2 * h);
      const dx = (i + 0.5) * h - ex;
      const dy = (j + 0.5) * h - ey;
      const r2 = dx * dx + dy * dy + ez * ez;
      const inv3 = 1 / (r2 * Math.sqrt(r2));
      // −∇u · ∇(1/r) = −(ux·(−dx/r³) + uy·(−dy/r³)) = (ux·dx + uy·dy)/r³
      phi += (ux * dx + uy * dy) * inv3;
    }
  }
  return phi * h * h;
}
