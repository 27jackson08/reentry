/**
 * Three-variable Fenton-Karma model of the cardiac action potential.
 *
 * Fenton & Karma, Chaos 8:20 (1998), doi:10.1063/1.166311.
 *
 *   du/dt = D ∇²u − (J_fi + J_so + J_si)
 *   dv/dt = (1−p)(1−v)/τ_v⁻(u) − p·v/τ_v⁺
 *   dw/dt = (1−p)(1−w)/τ_w⁻    − p·w/τ_w⁺
 *
 *   p = H(u − u_c),  q = H(u − u_v)
 *   τ_v⁻(u) = q ? tauVMinusHigh : tauVMinusLow
 *   J_fi = −(v/τ_d)·p·(1−u)(u−u_c)
 *   J_so =  (u/τ_0)(1−p) + p/τ_r
 *   J_si = −(w/(2τ_si))·(1 + tanh(k(u − u_c^si)))
 *
 * u is a dimensionless membrane voltage (0 rest, ≈1 peak), time is in ms.
 * The two τ_v⁻ values are named by the voltage range they apply to, because the
 * 1998 and 2002 papers index them in opposite orders.
 *
 * This file is the single TypeScript statement of the equations. The GLSL in
 * src/gpu/shaders/step.frag must match it; the Playwright parity test enforces that.
 */

export interface FkParams {
  readonly tauVPlus: number;
  /** τ_v⁻ used while u < u_v (cell nearly repolarized): fast recovery. */
  readonly tauVMinusLow: number;
  /** τ_v⁻ used while u ≥ u_v: slow recovery. */
  readonly tauVMinusHigh: number;
  readonly tauWPlus: number;
  readonly tauWMinus: number;
  readonly tauD: number;
  readonly tau0: number;
  readonly tauR: number;
  /** Infinity disables the slow inward current (sets 2 and 7 of Fenton 2002). */
  readonly tauSi: number;
  readonly k: number;
  readonly uCsi: number;
  readonly uC: number;
  readonly uV: number;
}

export interface CellState {
  readonly u: number;
  readonly v: number;
  readonly w: number;
}

export const REST: CellState = { u: 0, v: 1, w: 1 };

export interface Currents {
  readonly jfi: number;
  readonly jso: number;
  readonly jsi: number;
}

export function tauVMinus(u: number, p: FkParams): number {
  return u >= p.uV ? p.tauVMinusHigh : p.tauVMinusLow;
}

export function currents(s: CellState, p: FkParams): Currents {
  const above = s.u >= p.uC;
  const jfi = above ? -(s.v / p.tauD) * (1 - s.u) * (s.u - p.uC) : 0;
  const jso = above ? 1 / p.tauR : s.u / p.tau0;
  const jsi = -(s.w / (2 * p.tauSi)) * (1 + Math.tanh(p.k * (s.u - p.uCsi)));
  return { jfi, jso, jsi };
}

/** Right-hand side of du/dt excluding diffusion. iStim is an injected current. */
export function dudt(s: CellState, p: FkParams, iStim = 0): number {
  const j = currents(s, p);
  return -(j.jfi + j.jso + j.jsi) + iStim;
}

/**
 * Advance one cell by dt. Forward Euler for u, Rush-Larsen (exact exponential
 * relaxation toward the gate's target) for v and w. `laplacian` is D·∇²u.
 */
export function stepCell(
  s: CellState,
  p: FkParams,
  dt: number,
  iStim = 0,
  laplacian = 0,
): CellState {
  const above = s.u >= p.uC;
  const u = s.u + dt * (dudt(s, p, iStim) + laplacian);
  const vInf = above ? 0 : 1;
  const wInf = vInf;
  const tauV = above ? p.tauVPlus : tauVMinus(s.u, p);
  const tauW = above ? p.tauWPlus : p.tauWMinus;
  const v = vInf + (s.v - vInf) * Math.exp(-dt / tauV);
  const w = wInf + (s.w - wInf) * Math.exp(-dt / tauW);
  return { u, v, w };
}

export const STABILITY_SAFETY = 0.8;

/**
 * Throws when (dt, dx, D) violates the explicit-diffusion limit dt ≤ dx²/(4D)
 * or resolves the fast inward current too coarsely (dt > τ_d/2).
 */
export function checkStability(p: FkParams, dt: number, dx: number, diffusion: number): void {
  const diffusionLimit = (dx * dx) / (4 * diffusion);
  if (dt > STABILITY_SAFETY * diffusionLimit) {
    throw new Error(
      `dt=${dt} exceeds diffusion limit ${(STABILITY_SAFETY * diffusionLimit).toFixed(4)} ms`,
    );
  }
  if (dt > p.tauD / 2) {
    throw new Error(`dt=${dt} too coarse for tau_d=${p.tauD}; use dt ≤ ${p.tauD / 2}`);
  }
}
