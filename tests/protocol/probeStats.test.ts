import { describe, expect, test } from 'vitest';
import { activeFraction, probeIndex, probeMeanU } from '../../src/protocol/probeStats';

function probeWith(size: number, fill: (i: number, j: number) => [number, number, number, number]) {
  const buf = new Float32Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) buf.set(fill(i, j), (j * size + i) * 4);
  return buf;
}

describe('probe statistics', () => {
  test('probeIndex maps uv to the enclosing texel, clamped', () => {
    expect(probeIndex(0, 0, 64)).toBe(0);
    expect(probeIndex(0.999, 0.999, 64)).toBe(64 * 64 - 1);
    expect(probeIndex(1, 1, 64)).toBe(64 * 64 - 1);
    expect(probeIndex(0.5, 0.25, 64)).toBe(16 * 64 + 32);
  });

  test('probeMeanU reads channel r at a site', () => {
    const buf = probeWith(4, (i, j) => [i + 10 * j, 0, 0, 1]);
    expect(probeMeanU(buf, 4, 0.6, 0.3)).toBe(2 + 10 * 1);
  });

  test('activeFraction counts tissue texels whose max u exceeds the threshold', () => {
    const buf = probeWith(4, (i) => [0, i >= 2 ? 0.9 : 0.1, 0, 1]);
    expect(activeFraction(buf, 4, 0.5)).toBeCloseTo(0.5);
  });

  test('activeFraction ignores scar texels (count 0) and returns 0 for all-scar', () => {
    const buf = probeWith(4, () => [0, 0.9, 0, 0]);
    expect(activeFraction(buf, 4, 0.5)).toBe(0);
  });
});
