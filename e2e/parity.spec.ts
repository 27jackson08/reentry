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
  await openSim(page, { n: String(N), dx: String(preset.dx), preset: preset.id });
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
  await openSim(page, { n: String(N), dx: String(preset.dx), preset: preset.id });
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

test('GPU solver matches the CPU reference with fibre anisotropy', async ({ page }) => {
  await openSim(page, { n: String(N), dx: String(preset.dx), preset: preset.id });
  // 15 ms: on this 1.6 cm sheet the front has gone ~0.5 cm along fibres and ~0.25 cm across.
  const steps = 150;
  const fibres = { ratio: 4, angleDeg: 30 };

  const gpuU = await page.evaluate(
    ({ steps, fibres }) => {
      const h = window.__reentry;
      h.setFibres(fibres.ratio, fibres.angleDeg);
      h.stimulate({ kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.06, ry: 0.06 }, 0.5, 2);
      h.step(steps);
      return h.readU();
    },
    { steps, fibres },
  );

  let sheet = createSheet(N, N, preset.dx);
  // Same disc: texel centres within 0.06 of the sheet centre.
  const stim = Float32Array.from(sheet.stim);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N - 0.5;
      const y = (j + 0.5) / N - 0.5;
      if ((x / 0.06) ** 2 + (y / 0.06) ** 2 <= 1) stim[j * N + i] = 0.5;
    }
  sheet = { ...sheet, stim, stimRemainingMs: 2 };
  for (let i = 0; i < steps; i++)
    sheet = stepSheet(sheet, preset.params, preset.dt, preset.diffusion, fibres);

  // The front must be an ellipse: farther along the 30° fibre axis than across it.
  const at = (u: ArrayLike<number>, x: number, y: number) =>
    u[Math.round(y * N) * N + Math.round(x * N)] ?? 0;
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const r = 0.3;
  expect(at(sheet.u, 0.5 + r * c, 0.5 + r * s)).toBeGreaterThan(0.5); // along fibres
  expect(at(sheet.u, 0.5 - r * s, 0.5 + r * c)).toBeLessThan(0.5); // across fibres
  expect(at(gpuU, 0.5 + r * c, 0.5 + r * s)).toBeGreaterThan(0.5);
  expect(at(gpuU, 0.5 - r * s, 0.5 + r * c)).toBeLessThan(0.5);

  const { meanAbs, outlierFraction } = compare(gpuU, sheet.u);
  expect(meanAbs).toBeLessThan(2e-3);
  expect(outlierFraction).toBeLessThan(0.02);
});
