import { describe, expect, test } from 'vitest';
import { decodeUrlState, encodeUrlState, DEFAULT_URL_STATE } from '../../src/state/urlState';
import { encodeStrokes } from '../../src/protocol/scar';

describe('url state', () => {
  test('empty search yields defaults', () => {
    expect(decodeUrlState('')).toEqual(DEFAULT_URL_STATE);
    expect(decodeUrlState('?')).toEqual(DEFAULT_URL_STATE);
  });

  test('round-trips a full state', () => {
    const state = {
      preset: 'set1',
      n: 256,
      dx: 0.025,
      view: 'phase' as const,
      strokes: [{ x: 0.25, y: 0.75, r: 0.05, erase: false }],
      fibres: { ratio: 1, angleDeg: 0 },
    };
    const decoded = decodeUrlState(encodeUrlState(state));
    expect(decoded.preset).toBe('set1');
    expect(decoded.n).toBe(256);
    expect(decoded.dx).toBe(0.025);
    expect(decoded.view).toBe('phase');
    expect(decoded.strokes).toHaveLength(1);
    expect(decoded.strokes[0]!.x).toBeCloseTo(0.25, 2);
  });

  test('rejects unknown preset, out-of-range n and dx, and bad view', () => {
    const d = decodeUrlState('?preset=bogus&n=9999&dx=5&view=xray');
    expect(d.preset).toBe(DEFAULT_URL_STATE.preset);
    expect(d.n).toBe(DEFAULT_URL_STATE.n);
    expect(d.dx).toBe(DEFAULT_URL_STATE.dx);
    expect(d.view).toBe(DEFAULT_URL_STATE.view);
  });

  test('ignores malformed scar strings', () => {
    expect(decodeUrlState('?scar=%%%').strokes).toEqual([]);
    expect(
      decodeUrlState(`?scar=${encodeStrokes([{ x: 0.5, y: 0.5, r: 0.1, erase: true }])}`)
        .strokes[0]!.erase,
    ).toBe(true);
  });

  test('fibre settings round-trip and are validated', () => {
    const d = decodeUrlState('?aniso=4&angle=30');
    expect(d.fibres).toEqual({ ratio: 4, angleDeg: 30 });
    expect(encodeUrlState({ ...DEFAULT_URL_STATE, fibres: { ratio: 4, angleDeg: 30 } })).toBe(
      '?aniso=4&angle=30',
    );
    expect(decodeUrlState('?aniso=99').fibres.ratio).toBe(1);
    expect(decodeUrlState('?aniso=2&angle=200').fibres.angleDeg).toBe(20);
  });

  test('omits default-valued keys and empty scar from the encoded string', () => {
    expect(encodeUrlState(DEFAULT_URL_STATE)).toBe('');
    expect(encodeUrlState({ ...DEFAULT_URL_STATE, preset: 'set10' })).toBe('?preset=set10');
  });
});
