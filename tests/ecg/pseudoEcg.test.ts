import { describe, expect, test } from 'vitest';
import { pseudoEcg, type Electrode } from '../../src/ecg/pseudoEcg';

function probeFrom(size: number, u: (x: number, y: number) => number, tissue = true) {
  const buf = new Float32Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = (j * size + i) * 4;
      buf[k] = u((i + 0.5) / size, (j + 0.5) / size);
      buf[k + 1] = buf[k]!;
      buf[k + 3] = tissue ? 64 : 0;
    }
  return buf;
}

const sideCm = 20;
const above: Electrode = { x: 0.5, y: 0.5, heightCm: 2 };

describe('pseudo-ECG', () => {
  test('uniform tissue produces zero potential', () => {
    expect(
      pseudoEcg(
        probeFrom(32, () => 0.7),
        32,
        sideCm,
        above,
      ),
    ).toBeCloseTo(0, 9);
  });

  test('a front moving toward the electrode is positive, away is negative', () => {
    // Excited on the left half: the depolarization front at x = 0.5 points right (+x).
    const probe = probeFrom(32, (x) => (x < 0.5 ? 1 : 0));
    const right: Electrode = { x: 0.9, y: 0.5, heightCm: 1 };
    const left: Electrode = { x: 0.1, y: 0.5, heightCm: 1 };
    const toward = pseudoEcg(probe, 32, sideCm, right);
    const away = pseudoEcg(probe, 32, sideCm, left);
    expect(toward).toBeGreaterThan(0);
    expect(away).toBeLessThan(0);
    expect(toward).toBeCloseTo(-away, 6);
  });

  test('is linear in u', () => {
    const probe1 = probeFrom(32, (x) => (x < 0.5 ? 1 : 0));
    const probe2 = probeFrom(32, (x) => (x < 0.5 ? 2 : 0));
    const e: Electrode = { x: 0.9, y: 0.5, heightCm: 1 };
    expect(pseudoEcg(probe2, 32, sideCm, e)).toBeCloseTo(2 * pseudoEcg(probe1, 32, sideCm, e), 6);
  });

  test('scar texels are excluded', () => {
    const probe = probeFrom(32, (x) => (x < 0.5 ? 1 : 0), false);
    expect(pseudoEcg(probe, 32, sideCm, above)).toBe(0);
  });
});
