import { describe, expect, test } from 'vitest';
import { apd, restitutionCurve, singleCellTrace } from '../../src/model/measures';
import { presetById } from '../../src/model/presets';

const preset = presetById('set3');

describe('measures', () => {
  test('apd90 of a synthetic square pulse is its width', () => {
    const t = Array.from({ length: 1000 }, (_, i) => i * 0.1);
    const u = t.map((x) => (x >= 10 && x < 60 ? 1 : 0));
    expect(apd({ t, u }, 0.9)).toBeCloseTo(50, 1);
  });

  test('apd returns null when no action potential is present', () => {
    const t = [0, 1, 2];
    expect(apd({ t, u: [0, 0, 0] }, 0.9)).toBeNull();
  });

  test('single-cell APD90 lies in the ventricular range for the BR set', () => {
    const trace = singleCellTrace(preset.params, preset.dt, 800);
    const value = apd(trace, 0.9);
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(150);
    expect(value!).toBeLessThan(400);
  });

  test('APD restitution is monotonically non-decreasing in diastolic interval', () => {
    const di = [50, 100, 200, 400];
    const curve = restitutionCurve(preset.params, preset.dt, di);
    expect(curve.length).toBe(di.length);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.apd).toBeGreaterThanOrEqual(curve[i - 1]!.apd - 1e-6);
    }
    expect(curve[curve.length - 1]!.apd - curve[0]!.apd).toBeGreaterThan(5);
  });
});
