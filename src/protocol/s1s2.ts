/**
 * Cross-field S1-S2 induction as a pure state machine.
 *
 * S1 launches a plane wave from the left edge. The machine watches u at a
 * probe site just left of the S2 region's right boundary. When the wave back
 * has passed (u below the recovery threshold) and the fast gate has had time to
 * recover, S2 depolarizes the lower-left quadrant. Its right edge meets tissue
 * that is still refractory and blocks; its top edge propagates. The free wave
 * end at the corner curls into a reentrant spiral.
 */
import type { StimulusShape } from '../gpu/simulation';

export type S1S2Phase = 'awaitUpstroke' | 'awaitWaveBack' | 'awaitRecovery' | 'done' | 'failed';

export interface S1S2State {
  readonly phase: S1S2Phase;
  readonly startedMs: number;
  readonly waveBackAtMs?: number;
  readonly s2AtMs?: number;
}

export interface S1S2Config {
  readonly s1: StimulusShape;
  readonly s2: StimulusShape;
  readonly current: number;
  readonly durationMs: number;
  /** uv site whose mean u is sampled from the probe. */
  readonly probeSite: { readonly x: number; readonly y: number };
  readonly upstrokeThreshold: number;
  readonly waveBackThreshold: number;
  readonly recoveryDelayMs: number;
  readonly timeoutMs: number;
}

export interface StimulateAction {
  readonly type: 'stimulate';
  readonly shape: StimulusShape;
  readonly current: number;
  readonly durationMs: number;
}

export interface S1S2Result {
  readonly state: S1S2State;
  readonly actions: readonly StimulateAction[];
}

export const DEFAULT_S1S2: S1S2Config = {
  s1: { kind: 'rect', x0: 0, y0: 0, x1: 0.03, y1: 1 },
  s2: { kind: 'rect', x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
  current: 0.3,
  durationMs: 2,
  // Sample right on the S2 boundary and fire as soon as repolarization begins
  // there: tissue to the right is still at plateau and blocks, while the left
  // part of the S2 region repolarized long enough ago to be excitable.
  probeSite: { x: 0.5, y: 0.25 },
  upstrokeThreshold: 0.5,
  waveBackThreshold: 0.5,
  recoveryDelayMs: 0,
  timeoutMs: 3000,
};

export function startS1S2(cfg: S1S2Config, nowMs: number): S1S2Result {
  return {
    state: { phase: 'awaitUpstroke', startedMs: nowMs },
    actions: [
      { type: 'stimulate', shape: cfg.s1, current: cfg.current, durationMs: cfg.durationMs },
    ],
  };
}

export function advanceS1S2(
  state: S1S2State,
  cfg: S1S2Config,
  nowMs: number,
  probeU: number,
): S1S2Result {
  if (state.phase === 'done' || state.phase === 'failed') return { state, actions: [] };
  if (nowMs - state.startedMs > cfg.timeoutMs) {
    return { state: { ...state, phase: 'failed' }, actions: [] };
  }
  switch (state.phase) {
    case 'awaitUpstroke':
      return probeU > cfg.upstrokeThreshold
        ? { state: { ...state, phase: 'awaitWaveBack' }, actions: [] }
        : { state, actions: [] };
    case 'awaitWaveBack': {
      if (probeU >= cfg.waveBackThreshold) return { state, actions: [] };
      // Evaluate recovery in the same call so a zero delay fires immediately.
      return advanceS1S2(
        { ...state, phase: 'awaitRecovery', waveBackAtMs: nowMs },
        cfg,
        nowMs,
        probeU,
      );
    }
    case 'awaitRecovery': {
      const ready = nowMs - (state.waveBackAtMs ?? nowMs) >= cfg.recoveryDelayMs;
      if (!ready) return { state, actions: [] };
      return {
        state: { ...state, phase: 'done', s2AtMs: nowMs },
        actions: [
          { type: 'stimulate', shape: cfg.s2, current: cfg.current, durationMs: cfg.durationMs },
        ],
      };
    }
  }
}
