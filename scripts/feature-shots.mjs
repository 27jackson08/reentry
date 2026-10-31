// Screenshots of the tour, anisotropy and anchored scar on the real GPU. Usage: node scripts/feature-shots.mjs <url-base> <outdir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , base, outdir] = process.argv;
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const run = async (name, query, setup, settleMs = 3200) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?test=1${query}`);
  await page.waitForFunction(() => window.__reentry !== undefined);
  await page.evaluate(setup);
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: `${outdir}/${name}.png` });
  const hud = await page.evaluate(() =>
    ['hud-rhythm', 'hud-rotors', 'hud-status'].map((id) => document.getElementById(id).textContent),
  );
  console.log(name, JSON.stringify(hud), errors.length ? errors : '');
  await page.close();
};
await run('anisotropy', '&aniso=6&angle=30', () => {
  const h = window.__reentry;
  h.setStepsPerFrame(100);
  h.induce();
  while (h.timeMs() < 5000) h.tick(1);
});
await run('anchored', '&scar=ZmgAM', () => {
  const h = window.__reentry;
  h.setStepsPerFrame(100);
  h.induce();
  while (h.timeMs() < 6000) h.tick(1);
});
await run(
  'tour',
  '',
  () => {
    document.getElementById('tour-open').click();
    const h = window.__reentry;
    h.setStepsPerFrame(100);
    while (h.timeMs() < 400) h.tick(1);
  },
  1500,
);
await browser.close();
