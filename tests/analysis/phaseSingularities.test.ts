import { describe, expect, test } from 'vitest';
import {
  extractU,
  findPhaseSingularities,
  mergeSingularities,
  phaseOf,
} from '../../src/analysis/phaseSingularities';

/** Build (probe, uPast) from a phase field: now = c + r cos θ, past = c + r sin θ. */
function fromPhase(size: number, theta: (x: number, y: number) => number | null) {
  const probe = new Float32Array(size * size * 4);
  const past = new Float32Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const th = theta((i + 0.5) / size, (j + 0.5) / size);
      if (th === null) continue; // scar: tissue count stays 0
      probe[k * 4] = 0.45 + 0.3 * Math.cos(th);
      probe[k * 4 + 3] = 1;
      past[k] = 0.45 + 0.3 * Math.sin(th);
    }
  return { probe, past };
}

describe('phase singularities', () => {
  test('phaseOf is the angle of (u now, u past) about the origin', () => {
    expect(phaseOf(0.45 + 1, 0.45)).toBeCloseTo(0);
    expect(phaseOf(0.45, 0.45 + 1)).toBeCloseTo(Math.PI / 2);
  });

  test('a uniform field has no singularities', () => {
    const { probe, past } = fromPhase(32, () => 1.0);
    expect(findPhaseSingularities(probe, past, 32)).toEqual([]);
  });

  test('a single spiral phase field has exactly one singularity at its centre', () => {
    const { probe, past } = fromPhase(32, (x, y) => Math.atan2(y - 0.5, x - 0.5));
    const found = findPhaseSingularities(probe, past, 32);
    expect(found).toHaveLength(1);
    expect(found[0]!.x).toBeCloseTo(0.5, 1);
    expect(found[0]!.y).toBeCloseTo(0.5, 1);
    expect(found[0]!.charge).toBe(1);
  });

  test('two counter-rotating rotors are found with opposite charge', () => {
    const { probe, past } = fromPhase(
      48,
      (x, y) => Math.atan2(y - 0.5, x - 0.25) - Math.atan2(y - 0.5, x - 0.75),
    );
    const found = findPhaseSingularities(probe, past, 48).sort((a, b) => a.x - b.x);
    expect(found).toHaveLength(2);
    expect(found[0]!.charge).toBe(1);
    expect(found[1]!.charge).toBe(-1);
  });

  test('plaquettes touching scar are skipped', () => {
    const { probe, past } = fromPhase(32, (x, y) =>
      Math.hypot(x - 0.5, y - 0.5) < 0.1 ? null : Math.atan2(y - 0.5, x - 0.5),
    );
    expect(findPhaseSingularities(probe, past, 32)).toEqual([]);
  });

  test('mergeSingularities annihilates close opposite pairs and merges close same-charge ones', () => {
    const size = 64;
    const cell = 1 / size;
    const cluster = [
      { x: 0.5, y: 0.5, charge: 1 as const },
      { x: 0.5 + cell, y: 0.5 + cell, charge: -1 as const },
      { x: 0.5 - cell, y: 0.5 + cell, charge: 1 as const },
    ];
    const merged = mergeSingularities(cluster, size);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.charge).toBe(1);
    // Far-apart singularities are untouched, and the input is not mutated.
    const far = [
      { x: 0.2, y: 0.2, charge: 1 as const },
      { x: 0.8, y: 0.8, charge: -1 as const },
    ];
    expect(mergeSingularities(far, size)).toHaveLength(2);
    expect(cluster).toHaveLength(3);
  });

  test('extractU copies the mean-u channel into a fresh array', () => {
    const probe = Float32Array.from([0.1, 9, 9, 1, 0.2, 9, 9, 1]);
    const u = extractU(probe, 1);
    expect(u.length).toBe(1);
    expect(u[0]).toBeCloseTo(0.1, 6);
    const two = extractU(probe, 2);
    expect(two[1]).toBeCloseTo(0.2, 6);
    expect(two).not.toBe(probe);
  });
});
