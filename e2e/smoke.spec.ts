import { expect, test } from '@playwright/test';
import { openSim } from './helpers';

test('page loads, shaders compile, canvas is visible', async ({ page }) => {
  await openSim(page, { n: '64' });
  await expect(page.locator('#tissue')).toBeVisible();
  await expect(page.locator('#unsupported')).toBeHidden();
  const size = await page.evaluate(() => window.__reentry.size);
  expect(size).toBe(64);
});

test('a stimulus excites tissue and the sheet repolarizes afterwards', async ({ page }) => {
  await openSim(page, { n: '64' });
  const result = await page.evaluate(() => {
    const h = window.__reentry;
    h.stimulate({ kind: 'rect', x0: 0, y0: 0, x1: 0.1, y1: 1 }, 0.5, 2);
    h.step(300); // 30 ms
    const early = Math.max(...h.readU());
    h.step(6000); // +600 ms: the wave has crossed the 1.6 cm sheet and died out
    const late = Math.max(...h.readU());
    return { early, late, t: h.timeMs() };
  });
  expect(result.early).toBeGreaterThan(0.8);
  expect(result.late).toBeLessThan(0.05);
  expect(result.t).toBeCloseTo(630, 3);
});
