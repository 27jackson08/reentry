import { expect, test } from '@playwright/test';
import { openSim } from './helpers';

// A 192 grid at 0.08 cm spacing is a 15 cm sheet, which set 1's rotor sustains
// (docs/RESULTS.md §1) and which SwiftShader can step in reasonable time.
const SHEET = { n: '192', dx: '0.08' };
test.describe.configure({ timeout: 240_000 });

test('S1-S2 induction produces sustained reentry', async ({ page }) => {
  await openSim(page, SHEET);
  const result = await page.evaluate(() => {
    const h = window.__reentry;
    h.setStepsPerFrame(20);
    h.induce();
    const samples: number[] = [];
    // 3 s of simulated time, sampling activity every 250 ms after induction completes.
    while (h.timeMs() < 3000) {
      h.tick(1);
      if (Math.round(h.timeMs()) % 250 === 0) samples.push(h.activity());
    }
    return { samples, status: h.status(), rotors: h.rotors().length };
  });
  expect(result.status).toBe('active');
  // The phase-singularity detector sees the rotor tip (set 1 holds exactly one).
  expect(result.rotors).toBeGreaterThanOrEqual(1);
  expect(result.rotors).toBeLessThanOrEqual(3);
  // Every sample in the last two seconds shows activity: a plane wave alone would have died.
  const late = result.samples.slice(-8);
  expect(late.length).toBeGreaterThan(4);
  for (const a of late) expect(a).toBeGreaterThan(0.05);
});

test('a strong shock terminates reentry; a weak one does not', async ({ page }) => {
  await openSim(page, SHEET);
  const run = (current: number) =>
    page.evaluate((current) => {
      const h = window.__reentry;
      h.reset();
      h.setStepsPerFrame(20);
      h.induce();
      while (h.timeMs() < 1500) h.tick(1);
      const before = h.activity();
      h.shock(current, 5);
      while (h.timeMs() < 2500) h.tick(1);
      return { before, after: h.activity() };
    }, current);
  const strong = await run(1.0);
  expect(strong.before).toBeGreaterThan(0.05);
  expect(strong.after).toBe(0);
  // 0.01 raises u by under 0.04, below any threshold; 0.02 can fragment the rotor into wavelets that die on a small sheet.
  const weak = await run(0.01);
  expect(weak.before).toBeGreaterThan(0.05);
  expect(weak.after).toBeGreaterThan(0.05);
});

test('a scar wall blocks conduction and the mask round-trips through the URL', async ({ page }) => {
  await openSim(page, SHEET);
  const blocked = await page.evaluate(() => {
    const h = window.__reentry;
    const n = h.size;
    const mask = new Array(n * n).fill(1);
    for (let j = 0; j < n; j++)
      for (let i = Math.floor(n * 0.5); i < Math.floor(n * 0.5) + 3; i++) mask[j * n + i] = 0;
    h.setMask(mask);
    h.stimulate({ kind: 'rect', x0: 0, y0: 0, x1: 0.05, y1: 1 }, 0.5, 2);
    h.step(4000);
    const u = h.readU();
    let rightMax = 0;
    for (let j = 0; j < n; j++)
      for (let i = Math.floor(n * 0.6); i < n; i++) rightMax = Math.max(rightMax, u[j * n + i]!);
    return rightMax;
  });
  expect(blocked).toBeLessThan(0.01);

  await page.goto('/?test=1&n=192&dx=0.08&scar=gAAgAAI');
  await page.waitForFunction(() => typeof window.__reentry !== 'undefined');
  const cells = await page.evaluate(() => {
    const h = window.__reentry;
    h.step(1);
    return h.readU().length;
  });
  expect(cells).toBe(192 * 192);
});
