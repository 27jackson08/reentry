import { describe, expect, test } from 'vitest';
import { advancePacing, startPacing, type PacingState } from '../../src/protocol/pacing';

const site = { cx: 0.5, cy: 0.5, rx: 0.03, ry: 0.03 } as const;

describe('pacing schedule', () => {
  test('starts with the first beat due now', () => {
    const p = startPacing(
      { site, cycleLengthMs: 150, beats: 8, current: 0.3, durationMs: 2 },
      1000,
    );
    expect(p.nextAtMs).toBe(1000);
    expect(p.remainingBeats).toBe(8);
  });

  test('fires a beat when due and schedules the next one on the cycle length', () => {
    let p: PacingState | null = startPacing(
      { site, cycleLengthMs: 150, beats: 2, current: 0.3, durationMs: 2 },
      0,
    );
    let r = advancePacing(p, 0);
    expect(r.fire).toBe(true);
    p = r.state;
    expect(p!.nextAtMs).toBe(150);
    expect(p!.remainingBeats).toBe(1);
    r = advancePacing(p!, 100);
    expect(r.fire).toBe(false);
    r = advancePacing(p!, 150);
    expect(r.fire).toBe(true);
    expect(r.state).toBeNull(); // last beat delivered
  });

  test('is immutable', () => {
    const p = startPacing({ site, cycleLengthMs: 100, beats: 3, current: 0.3, durationMs: 2 }, 0);
    const r = advancePacing(p, 0);
    expect(p.remainingBeats).toBe(3);
    expect(r.state).not.toBe(p);
  });
});
