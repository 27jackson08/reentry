import { describe, expect, test } from 'vitest';
import { analyzeRhythm } from '../../src/ecg/rhythm';

function series(durationMs: number, dtMs: number, f: (t: number) => number) {
  const out = [];
  for (let t = 0; t <= durationMs; t += dtMs) out.push({ t, phi: f(t) });
  return out;
}

describe('rhythm analysis', () => {
  test('recovers the period of a regular signal', () => {
    const samples = series(3000, 4, (t) => Math.sin((2 * Math.PI * t) / 180));
    const r = analyzeRhythm(samples);
    expect(r).not.toBeNull();
    expect(r!.cycleMs).toBeGreaterThan(170);
    expect(r!.cycleMs).toBeLessThan(190);
    expect(r!.regularity).toBeGreaterThan(0.9);
  });

  test('works with uneven sampling by resampling', () => {
    const samples = [];
    let t = 0;
    while (t < 3000) {
      samples.push({ t, phi: Math.sin((2 * Math.PI * t) / 250) });
      t += t % 7 === 0 ? 3 : 11;
    }
    const r = analyzeRhythm(samples);
    expect(r!.cycleMs).toBeGreaterThan(235);
    expect(r!.cycleMs).toBeLessThan(265);
  });

  test('a flat signal has no rhythm', () => {
    expect(analyzeRhythm(series(3000, 4, () => 0))).toBeNull();
    expect(analyzeRhythm(series(3000, 4, () => 1e-9 * Math.random()))).toBeNull();
  });

  test('too short a window has no rhythm', () => {
    expect(analyzeRhythm(series(200, 4, (t) => Math.sin(t)))).toBeNull();
  });

  test('irregular signal scores low regularity', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647) * 2 - 1;
    // Random-walk-like broadband signal with no stable period.
    let x = 0;
    const samples = series(3000, 4, () => (x = 0.7 * x + rand()));
    const r = analyzeRhythm(samples);
    expect(r === null || r.regularity < 0.6).toBe(true);
  });
});
