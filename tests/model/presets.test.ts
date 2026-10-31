import { describe, expect, test } from 'vitest';
import { DEFAULT_PRESET_ID, PRESETS, presetById } from '../../src/model/presets';
import { checkStability } from '../../src/model/fentonKarma';

describe('presets', () => {
  test('ids are unique and default exists', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PRESET_ID);
  });

  test('every preset carries a citation and a description', () => {
    for (const p of PRESETS) {
      expect(p.citation.length).toBeGreaterThan(10);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  test('every preset is numerically stable at its own dt', () => {
    for (const p of PRESETS) {
      expect(() => checkStability(p.params, p.dt, p.dx, p.diffusion)).not.toThrow();
    }
  });

  test('unknown id throws', () => {
    expect(() => presetById('nope')).toThrow();
  });

  test('time constants are positive and uC above uV', () => {
    for (const p of PRESETS) {
      const q = p.params;
      for (const v of [
        q.tauVPlus,
        q.tauVMinusLow,
        q.tauVMinusHigh,
        q.tauWPlus,
        q.tauWMinus,
        q.tauD,
        q.tau0,
        q.tauR,
        q.tauSi,
      ]) {
        expect(v).toBeGreaterThan(0);
      }
      expect(q.uC).toBeGreaterThan(q.uV);
    }
  });
});
