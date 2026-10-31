import { describe, expect, test } from 'vitest';
import { REST, currents, stepCell, tauVMinus } from '../../src/model/fentonKarma';
import { PRESETS, presetById } from '../../src/model/presets';

const BR = presetById('set3').params;

describe('Fenton-Karma single cell', () => {
  test('rest state is a fixed point', () => {
    let s = REST;
    for (let i = 0; i < 1000; i++) s = stepCell(s, BR, 0.1);
    // The true rest point sits a few 1e-8 above zero: the tanh tail of J_si is
    // balanced by J_so = u/tau_0. That is the model, not drift.
    expect(s.u).toBeLessThan(1e-6);
    expect(s.v).toBeCloseTo(1, 6);
    expect(s.w).toBeCloseTo(1, 6);
  });

  test('all currents vanish at rest', () => {
    const j = currents(REST, BR);
    expect(j.jfi).toBe(0);
    expect(j.jso).toBe(0);
    expect(Math.abs(j.jsi)).toBeLessThan(1e-6);
  });

  test('tau_v minus switches at u_v: slow recovery when u is still elevated', () => {
    expect(tauVMinus(BR.uV + 0.01, BR)).toBe(BR.tauVMinusHigh);
    expect(tauVMinus(BR.uV - 0.01, BR)).toBe(BR.tauVMinusLow);
    expect(BR.tauVMinusHigh).toBeGreaterThan(BR.tauVMinusLow);
  });

  test('sub-threshold stimulus decays back to rest', () => {
    let s = { ...REST, u: BR.uC * 0.5 };
    let peak = s.u;
    for (let i = 0; i < 2000; i++) {
      s = stepCell(s, BR, 0.1);
      peak = Math.max(peak, s.u);
    }
    expect(peak).toBeLessThan(BR.uC);
    expect(s.u).toBeLessThan(1e-3);
  });

  test('supra-threshold stimulus fires an action potential and repolarizes', () => {
    let s = { ...REST, u: 0.3 };
    let peak = 0;
    let repolarizedAt = -1;
    for (let i = 0; i < 6000; i++) {
      s = stepCell(s, BR, 0.1);
      peak = Math.max(peak, s.u);
      if (repolarizedAt < 0 && peak > 0.8 && s.u < 0.05) repolarizedAt = i * 0.1;
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(repolarizedAt).toBeGreaterThan(100);
    expect(repolarizedAt).toBeLessThan(500);
  });

  test('Rush-Larsen gate update is exact for a constant-u relaxation', () => {
    // Below threshold with u held at 0, v relaxes to 1 with tau = tauVMinusLow.
    const dt = 0.1;
    const s = stepCell({ u: 0, v: 0.2, w: 1 }, BR, dt, 0, 0);
    const expected = 1 - (1 - 0.2) * Math.exp(-dt / BR.tauVMinusLow);
    expect(s.v).toBeCloseTo(expected, 12);
  });

  test('stimulus current raises u by iStim*dt from rest', () => {
    const s = stepCell(REST, BR, 0.1, 0.5, 0);
    expect(s.u).toBeCloseTo(0.05, 9);
  });

  test('every preset produces a physiologically shaped action potential', () => {
    for (const preset of PRESETS) {
      let s = { ...REST, u: 0.3 };
      let peak = 0;
      let repolarized = false;
      for (let i = 0; i < 10000; i++) {
        s = stepCell(s, preset.params, preset.dt);
        peak = Math.max(peak, s.u);
        if (peak > 0.8 && s.u < 0.05) {
          repolarized = true;
          break;
        }
      }
      expect(peak, preset.id).toBeGreaterThan(0.85);
      // Sets with a strong slow inward current (4, 5, 6) overshoot u = 1 by design.
      expect(peak, preset.id).toBeLessThan(1.5);
      expect(repolarized, preset.id).toBe(true);
    }
  });
});
