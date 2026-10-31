/**
 * CPU reference solver for the Fenton-Karma sheet.
 *
 * It exists for tests: it uses the same 9-point masked Laplacian and the same
 * cell update as the GPU shader, so the two can be compared texel for texel.
 * Every operation returns a new Sheet; nothing is mutated.
 */
import { REST, stepCell, type FkParams } from './fentonKarma';

export interface Sheet {
  readonly width: number;
  readonly height: number;
  /** cm */
  readonly dx: number;
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly w: Float32Array;
  /** 1 = conducting tissue, 0 = scar (non-conducting, held at rest). */
  readonly mask: Uint8Array;
  /** Running maximum of u per cell; used by tests to detect activation. */
  readonly maxU: Float32Array;
  /** Injected current per cell, applied while stimRemainingMs > 0. */
  readonly stim: Float32Array;
  readonly stimRemainingMs: number;
}

export function createSheet(width: number, height: number, dx: number): Sheet {
  const n = width * height;
  return {
    width,
    height,
    dx,
    u: new Float32Array(n).fill(REST.u),
    v: new Float32Array(n).fill(REST.v),
    w: new Float32Array(n).fill(REST.w),
    mask: new Uint8Array(n).fill(1),
    maxU: new Float32Array(n),
    stim: new Float32Array(n),
    stimRemainingMs: 0,
  };
}

const EDGE_WEIGHT = 4;
const CORNER_WEIGHT = 1;
const STENCIL_NORM = 6;

/**
 * Isotropic 9-point Laplacian with no-flux conditions at the domain edge and
 * at scar: a neighbour that is outside or non-conducting contributes nothing,
 * which is equivalent to mirroring u across that face.
 */
export function laplacian9(s: Sheet, i: number, j: number): number {
  const { width, height, u, mask } = s;
  const c = u[j * width + i] ?? 0;
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
      const idx = nj * width + ni;
      if (mask[idx] === 0) continue;
      const weight = di === 0 || dj === 0 ? EDGE_WEIGHT : CORNER_WEIGHT;
      sum += weight * ((u[idx] ?? 0) - c);
    }
  }
  return sum / (STENCIL_NORM * s.dx * s.dx);
}

export function stepSheet(s: Sheet, p: FkParams, dt: number, diffusion: number): Sheet {
  const n = s.width * s.height;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const w = new Float32Array(n);
  const maxU = new Float32Array(n);
  for (let j = 0; j < s.height; j++) {
    for (let i = 0; i < s.width; i++) {
      const idx = j * s.width + i;
      if (s.mask[idx] === 0) {
        u[idx] = REST.u;
        v[idx] = REST.v;
        w[idx] = REST.w;
        continue;
      }
      const lap = diffusion * laplacian9(s, i, j);
      const cell = { u: s.u[idx] ?? 0, v: s.v[idx] ?? 1, w: s.w[idx] ?? 1 };
      const next = stepCell(cell, p, dt, s.stim[idx] ?? 0, lap);
      u[idx] = next.u;
      v[idx] = next.v;
      w[idx] = next.w;
      maxU[idx] = Math.max(s.maxU[idx] ?? 0, next.u);
    }
  }
  const stimRemainingMs = s.stimRemainingMs - dt;
  const stim = stimRemainingMs > 0 ? s.stim : new Float32Array(n);
  return { ...s, u, v, w, maxU, stim, stimRemainingMs: Math.max(0, stimRemainingMs) };
}

export const DEFAULT_STIM_DURATION_MS = 2;

/** Inject a current on the inclusive rectangle for `durationMs` of simulated time. */
export function stimulateRect(
  s: Sheet,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  current: number,
  durationMs = DEFAULT_STIM_DURATION_MS,
): Sheet {
  const stim = Float32Array.from(s.stim);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) stim[j * s.width + i] = current;
  return { ...s, stim, stimRemainingMs: Math.max(s.stimRemainingMs, durationMs) };
}

export function withMaskDisc(
  s: Sheet,
  ci: number,
  cj: number,
  radius: number,
  value: 0 | 1,
): Sheet {
  const mask = Uint8Array.from(s.mask);
  const r2 = radius * radius;
  for (let j = 0; j < s.height; j++) {
    for (let i = 0; i < s.width; i++) {
      const d2 = (i - ci) ** 2 + (j - cj) ** 2;
      if (d2 <= r2) mask[j * s.width + i] = value;
    }
  }
  return { ...s, mask };
}
