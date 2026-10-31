/**
 * Antitachycardia pacing: a burst of point stimuli at a fixed cycle length,
 * slightly shorter than the rotor's. Each beat entrains a little more tissue
 * until the paced wavefront collides with the rotor and extinguishes it, or
 * fails and the rotor resumes. The schedule is advanced per time step inside
 * the simulation so beats land exactly on the step grid.
 */

export interface PacingConfig {
  readonly site: {
    readonly cx: number;
    readonly cy: number;
    readonly rx: number;
    readonly ry: number;
  };
  readonly cycleLengthMs: number;
  readonly beats: number;
  readonly current: number;
  readonly durationMs: number;
}

export interface PacingState {
  readonly config: PacingConfig;
  readonly nextAtMs: number;
  readonly remainingBeats: number;
}

export function startPacing(config: PacingConfig, nowMs: number): PacingState {
  return { config, nextAtMs: nowMs, remainingBeats: config.beats };
}

/** Returns whether a beat fires at `nowMs`, and the state after it (null when the burst is finished). */
export function advancePacing(
  state: PacingState,
  nowMs: number,
): { readonly fire: boolean; readonly state: PacingState | null } {
  if (nowMs + 1e-9 < state.nextAtMs) return { fire: false, state };
  const remainingBeats = state.remainingBeats - 1;
  return {
    fire: true,
    state:
      remainingBeats > 0
        ? { ...state, nextAtMs: state.nextAtMs + state.config.cycleLengthMs, remainingBeats }
        : null,
  };
}
