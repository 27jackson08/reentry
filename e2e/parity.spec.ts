import { expect, test } from '@playwright/test';
import { openSim } from './helpers';
import { createSheet, stepSheet, stimulateRect, withMaskDisc } from '../src/model/cpuSolver';
import { presetById } from '../src/model/presets';

const N = 64;
const preset = presetById('set3');

function compare(gpu: number[], cpu: Float32Array) {
  let sumAbs = 0;
  let outliers = 0;
  for (let i = 0; i < cpu.length; i++) {
    const d = Math.abs((gpu[i] ?? 0) - (cpu[i] ?? 0));
    sumAbs += d;
    if (d > 0.02) outliers++;
  }
  return { meanAbs: sumAbs / cpu.length, outlierFraction: outliers / cpu.length };
}

test('GPU solver matches the CPU reference for a propagating plane wave', async ({ page }) => {
  await openSim(page, { n: String(N), preset: preset.id });
  const steps = 400; // 40 ms

  const gpuU = await page.evaluate(
    ({ steps }) => {
      const h = window.__reentry;
      // Texels 0..2 have centres at (i + 0.5)/64 ≤ 3/64.
      h.stimulate({ kind: 'rect', x0: 0, y0: 0, x1: 3 / 64, y1: 1 }, 0.5, 2);
      h.step(steps);
      return h.readU();
    },
    { steps },
  );

  let sheet = createSheet(N, N, preset.dx);
  sheet = stimulateRect(sheet, 0, 2, 0, N - 1, 0.5, 2);
  for (let i = 0; i < steps; i++)
    sheet = stepSheet(sheet, preset.params, preset.dt, preset.diffusion);

  // Both must show a wave that has travelled into the sheet, or the comparison is vacuous.
  const column = 24;
  expect(sheet.u[(N / 2) * N + column]).toBeGreaterThan(0.5);
  expect(gpuU[(N / 2) * N + column]).toBeGreaterThan(0.5);

  const { meanAbs, outlierFraction } = compare(gpuU, sheet.u);
  // float32 shader vs float64 CPU: a few front texels straddle the threshold
  // on different steps, so compare distributions rather than the maximum.
  expect(meanAbs).toBeLessThan(2e-3);
  expect(outlierFraction).toBeLessThan(0.02);
});

test('GPU solver matches the CPU reference with a scar disc in the path', async ({ page }) => {
  await openSim(page, { n: String(N), preset: preset.id });
  const steps = 500;
  const disc = { ci: 32, cj: 32, r: 8 };

  let sheet = createSheet(N, N, preset.dx);
  sheet = withMaskDisc(sheet, disc.ci, disc.cj, disc.r, 0);
  const mask = Array.from(sheet.mask);

  const gpuU = await page.evaluate(
    ({ steps, mask }) => {
      const h = window.__reentry;
      h.setMask(mask);
      h.stimulate({ kind: 'rect', x0: 0, y0: 0, x1: 3 / 64, y1: 1 }, 0.5, 2);
      h.step(steps);
      return h.readU();
    },
    { steps, mask },
  );

  sheet = stimulateRect(sheet, 0, 2, 0, N - 1, 0.5, 2);
  for (let i = 0; i < steps; i++)
    sheet = stepSheet(sheet, preset.params, preset.dt, preset.diffusion);

  expect(gpuU[disc.cj * N + disc.ci]).toBe(0);
  const { meanAbs, outlierFraction } = compare(gpuU, sheet.u);
  expect(meanAbs).toBeLessThan(2e-3);
  expect(outlierFraction).toBeLessThan(0.02);
});
