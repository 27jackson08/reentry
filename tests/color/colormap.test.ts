import { describe, expect, test } from 'vitest';
import { buildLut, oklchToSrgb, PHASE_STOPS, VOLTAGE_STOPS } from '../../src/color/colormap';

function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('colormap', () => {
  test('oklch white and black round-trip to sRGB extremes', () => {
    expect(oklchToSrgb({ l: 1, c: 0, h: 0 })).toEqual([255, 255, 255]);
    expect(oklchToSrgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
  });

  test('oklch mid grey is neutral', () => {
    const [r, g, b] = oklchToSrgb({ l: 0.6, c: 0, h: 120 });
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
  });

  test('LUT has 256 RGBA entries with opaque alpha', () => {
    const lut = buildLut(VOLTAGE_STOPS, 256);
    expect(lut.length).toBe(256 * 4);
    for (let i = 3; i < lut.length; i += 4) expect(lut[i]).toBe(255);
  });

  test('voltage map is monotonically brighter: resting tissue is dark, excited is bright', () => {
    const lut = buildLut(VOLTAGE_STOPS, 256);
    let last = -1;
    for (let i = 0; i < 256; i++) {
      const y = luminance(lut[i * 4]!, lut[i * 4 + 1]!, lut[i * 4 + 2]!);
      expect(y).toBeGreaterThanOrEqual(last - 1e-3);
      last = y;
    }
    expect(luminance(lut[0]!, lut[1]!, lut[2]!)).toBeLessThan(0.02);
    expect(luminance(lut[1020]!, lut[1021]!, lut[1022]!)).toBeGreaterThan(0.7);
  });

  test('phase map is cyclic: first and last entries match', () => {
    const lut = buildLut(PHASE_STOPS, 256, true);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(lut[c]! - lut[255 * 4 + c]!)).toBeLessThanOrEqual(3);
    }
  });
});
