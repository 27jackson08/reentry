import { describe, expect, test } from 'vitest';
import { advanceS1S2, DEFAULT_S1S2, startS1S2, type S1S2State } from '../../src/protocol/s1s2';

const cfg = DEFAULT_S1S2;

function drive(state: S1S2State, samples: { t: number; u: number }[]) {
  let s = state;
  const actions = [];
  for (const { t, u } of samples) {
    const r = advanceS1S2(s, cfg, t, u);
    s = r.state;
    actions.push(...r.actions);
  }
  return { state: s, actions };
}

describe('S1-S2 protocol', () => {
  test('start emits S1 and waits for the wave to reach the probe', () => {
    const { state, actions } = startS1S2(cfg, 0);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'stimulate', shape: cfg.s1 });
    expect(state.phase).toBe('awaitUpstroke');
  });

  test('fires S2 when repolarization first reaches the probe on the S2 boundary', () => {
    const { state: s0 } = startS1S2(cfg, 0);
    const { state, actions } = drive(s0, [
      { t: 10, u: 0 },
      { t: 60, u: 0.95 }, // upstroke at probe
      { t: 200, u: 0.9 },
      { t: 290, u: 0.9 },
    ]);
    expect(actions).toHaveLength(0);
    expect(state.phase).toBe('awaitWaveBack');
    const r = advanceS1S2(state, cfg, 300, cfg.waveBackThreshold - 0.01); // wave back arrives
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ type: 'stimulate', shape: cfg.s2 });
    expect(r.state.phase).toBe('done');
    expect(r.state.s2AtMs).toBe(300);
  });

  test('is immutable: advancing returns new state objects', () => {
    const { state: s0 } = startS1S2(cfg, 0);
    const r = advanceS1S2(s0, cfg, 50, 0.9);
    expect(r.state).not.toBe(s0);
    expect(s0.phase).toBe('awaitUpstroke');
  });

  test('fails with no actions when the wave never arrives before the timeout', () => {
    const { state: s0 } = startS1S2(cfg, 0);
    const r = advanceS1S2(s0, cfg, cfg.timeoutMs + 1, 0);
    expect(r.state.phase).toBe('failed');
    expect(r.actions).toHaveLength(0);
  });

  test('done and failed states are terminal', () => {
    const done: S1S2State = { phase: 'done', startedMs: 0, s2AtMs: 100 };
    expect(advanceS1S2(done, cfg, 500, 0.9).state).toBe(done);
    const failed: S1S2State = { phase: 'failed', startedMs: 0 };
    expect(advanceS1S2(failed, cfg, 500, 0.9).state).toBe(failed);
  });
});
