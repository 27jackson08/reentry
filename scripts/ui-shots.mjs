// Real-GPU full-page screenshots after auto-induce. Usage: node scripts/ui-shots.mjs <url-base> <outdir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , base, outdir] = process.argv;
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
for (const [name, query, waitMs] of [
  ['default', '', 12000],
  ['set3', '?preset=set3', 9000],
  ['phase10', '?preset=set10&view=phase', 7000],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/${query}`);
  await page.waitForTimeout(waitMs);
  if (name === 'default') {
    await page.click('#shock');
    await page.waitForTimeout(80);
  }
  const hud = await page.evaluate(() =>
    ['hud-time', 'hud-rate', 'hud-rhythm', 'hud-status'].map(
      (id) => document.getElementById(id).textContent,
    ),
  );
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(name, JSON.stringify(hud), errors.length ? errors : '');
  await page.close();
}
await browser.close();
