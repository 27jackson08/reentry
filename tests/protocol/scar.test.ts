import { describe, expect, test } from 'vitest';
import {
  addStroke,
  applyStroke,
  decodeStrokes,
  encodeStrokes,
  MAX_STROKES,
  rasterize,
  tissueMask,
  type Stroke,
} from '../../src/protocol/scar';

const disc: Stroke = { x: 0.5, y: 0.5, r: 0.1, erase: false };

describe('scar strokes', () => {
  test('rasterize paints a disc of scar (0) into a tissue mask (1)', () => {
    const mask = rasterize([disc], 64);
    expect(mask[32 * 64 + 32]).toBe(0);
    expect(mask[32 * 64 + 36]).toBe(0); // 4/64 = 0.0625 < 0.1
    expect(mask[32 * 64 + 40]).toBe(1); // 8/64 = 0.125 > 0.1
    expect(mask[0]).toBe(1);
  });

  test('erase strokes restore tissue and order matters', () => {
    const erase: Stroke = { x: 0.5, y: 0.5, r: 0.05, erase: true };
    const mask = rasterize([disc, erase], 64);
    expect(mask[32 * 64 + 32]).toBe(1);
    expect(mask[32 * 64 + 37]).toBe(0);
    const reversed = rasterize([erase, disc], 64);
    expect(reversed[32 * 64 + 32]).toBe(0);
  });

  test('applyStroke is incremental and equals a full rasterize', () => {
    const base = rasterize([disc], 64);
    const erase: Stroke = { x: 0.55, y: 0.5, r: 0.04, erase: true };
    const incremental = applyStroke(base, erase, 64);
    expect(incremental).toEqual(rasterize([disc, erase], 64));
    expect(incremental).not.toBe(base);
    expect(base[35 * 64 + 35]).toBe(0);
  });

  test('tissueMask is all ones', () => {
    const m = tissueMask(8);
    expect(m.length).toBe(64);
    expect(m.every((x) => x === 1)).toBe(true);
  });

  test('addStroke returns a new array and caps the length', () => {
    let strokes: readonly Stroke[] = [];
    for (let i = 0; i < MAX_STROKES + 5; i++) {
      const next = addStroke(strokes, { ...disc, x: i / 1000 });
      expect(next).not.toBe(strokes);
      strokes = next;
    }
    expect(strokes.length).toBe(MAX_STROKES);
    // Oldest strokes drop first.
    expect(strokes[0]!.x).toBeCloseTo(5 / 1000);
  });

  test('encode/decode round-trips strokes within quantization error', () => {
    const strokes: Stroke[] = [
      { x: 0.123, y: 0.456, r: 0.05, erase: false },
      { x: 0.9, y: 0.1, r: 0.2, erase: true },
    ];
    const decoded = decodeStrokes(encodeStrokes(strokes));
    expect(decoded).toHaveLength(2);
    decoded.forEach((d, i) => {
      expect(d.x).toBeCloseTo(strokes[i]!.x, 2);
      expect(d.y).toBeCloseTo(strokes[i]!.y, 2);
      expect(d.r).toBeCloseTo(strokes[i]!.r, 2);
      expect(d.erase).toBe(strokes[i]!.erase);
    });
  });

  test('decode rejects garbage and clamps out-of-range values', () => {
    expect(decodeStrokes('')).toEqual([]);
    expect(decodeStrokes('!!!not-valid')).toEqual([]);
    expect(decodeStrokes('zzzz')).toEqual([]);
  });

  test('decode ignores strokes beyond the cap', () => {
    const many = Array.from({ length: MAX_STROKES + 10 }, () => disc);
    expect(decodeStrokes(encodeStrokes(many)).length).toBe(MAX_STROKES);
  });
});
