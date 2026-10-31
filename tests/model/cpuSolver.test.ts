import { describe, expect, test } from 'vitest';
import {
  createSheet,
  laplacian9,
  stepSheet,
  stimulateRect,
  withMaskDisc,
  type Sheet,
} from '../../src/model/cpuSolver';
import { presetById } from '../../src/model/presets';
import { REST } from '../../src/model/fentonKarma';

const preset = presetById('set3');

function run(sheet: Sheet, steps: number): Sheet {
  let s = sheet;
  for (let i = 0; i < steps; i++) s = stepSheet(s, preset.params, preset.dt, preset.diffusion);
  return s;
}

describe('cpu reference solver', () => {
  test('createSheet starts at rest and does not mutate on step', () => {
    const sheet = createSheet(8, 8, 0.025);
    const before = Float32Array.from(sheet.u);
    const after = stepSheet(sheet, preset.params, 0.1, preset.diffusion);
    expect(sheet.u).toEqual(before);
    expect(after).not.toBe(sheet);
    expect(Math.max(...after.u)).toBeLessThan(1e-6);
  });

  test('9-point laplacian of a quadratic is its analytic value in the interior', () => {
    const n = 9;
    const dx = 0.5;
    const sheet = createSheet(n, n, dx);
    const u = new Float32Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i * dx;
        const y = j * dx;
        u[j * n + i] = x * x + 2 * y * y; // laplacian = 2 + 4 = 6
      }
    const lap = laplacian9({ ...sheet, u }, 4, 4);
    expect(lap).toBeCloseTo(6, 5);
  });

  test('no-flux boundary: a uniform sheet has zero laplacian everywhere including edges and corners', () => {
    const sheet = createSheet(5, 5, 0.025);
    const u = new Float32Array(25).fill(0.7);
    const s = { ...sheet, u };
    expect(laplacian9(s, 0, 0)).toBe(0);
    expect(laplacian9(s, 4, 0)).toBe(0);
    expect(laplacian9(s, 2, 2)).toBe(0);
  });

  test('scar cells never depolarize and block conduction across a full wall', () => {
    const n = 40;
    let sheet = createSheet(n, 4, 0.025);
    // Wall of scar at column 20..21 spanning all rows.
    const mask = Uint8Array.from(sheet.mask);
    for (let j = 0; j < 4; j++) for (const i of [20, 21]) mask[j * n + i] = 0;
    sheet = { ...sheet, mask };
    sheet = stimulateRect(sheet, 0, 3, 0, 3, 1.0);
    const after = run(sheet, 1500);
    let leftActivated = false;
    let rightActivated = false;
    for (let j = 0; j < 4; j++) {
      leftActivated ||= (after.u[j * n + 10] ?? 0) > 0.1 || (after.maxU[j * n + 10] ?? 0) > 0.5;
      rightActivated ||= (after.maxU[j * n + 30] ?? 0) > 0.1;
      expect(after.u[j * n + 20]).toBe(0);
      expect(after.maxU[j * n + 20]).toBe(0);
    }
    expect(leftActivated).toBe(true);
    expect(rightActivated).toBe(false);
  });

  test('a plane wave propagates along a 1D cable at a physiological velocity', () => {
    const n = 200; // 5 cm
    let cable = createSheet(n, 1, 0.025);
    cable = stimulateRect(cable, 0, 2, 0, 0, 1.0);
    const arrival: number[] = [];
    const probes = [60, 140];
    let t = 0;
    for (let step = 0; step < 3000 && arrival.length < 2; step++) {
      cable = stepSheet(cable, preset.params, preset.dt, preset.diffusion);
      t += preset.dt;
      const target = probes[arrival.length]!;
      if ((cable.u[target] ?? 0) > 0.5) arrival.push(t);
    }
    expect(arrival.length).toBe(2);
    const cv = ((probes[1]! - probes[0]!) * 0.025) / (arrival[1]! - arrival[0]!);
    // 20-80 cm/s window: ventricular conduction velocity.
    expect(cv).toBeGreaterThan(0.02);
    expect(cv).toBeLessThan(0.08);
  });

  test('withMaskDisc paints a disc without mutating the source', () => {
    const sheet = createSheet(20, 20, 0.025);
    const painted = withMaskDisc(sheet, 10, 10, 3, 0);
    expect(sheet.mask[10 * 20 + 10]).toBe(1);
    expect(painted.mask[10 * 20 + 10]).toBe(0);
    expect(painted.mask[10 * 20 + 14]).toBe(1);
    expect(painted.u).toBe(sheet.u);
  });

  test('REST is the initial cell state of every sheet cell', () => {
    const sheet = createSheet(3, 3, 0.025);
    expect(sheet.v.every((x) => x === REST.v)).toBe(true);
    expect(sheet.w.every((x) => x === REST.w)).toBe(true);
  });
});
