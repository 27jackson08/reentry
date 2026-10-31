// Canvas-only screenshots for the README, on the real GPU. Usage: node scripts/readme-shots.mjs <url-base> <outdir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , base, outdir] = process.argv;
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const shots = [
  { name: 'rotor-set8', preset: 'set8', ms: 4000, scar: false },
  { name: 'fibrillation-set3', preset: 'set3', ms: 3000, scar: false },
  { name: 'anchored-set8', preset: 'set8', ms: 5000, scar: true },
  { name: 'phase-set10', preset: 'set10', ms: 4000, scar: false, view: 'phase' },
];
for (const s of shots) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${base}/?test=1&preset=${s.preset}${s.view ? `&view=${s.view}` : ''}`);
  await page.waitForFunction(() => window.__reentry !== undefined);
  await page.evaluate(({ ms, scar }) => {
    const h = window.__reentry;
    h.setStepsPerFrame(50);
    h.induce();
    while (h.timeMs() < 800) h.tick(1);
    if (scar) document.getElementById('scar-patch').click();
    while (h.timeMs() < ms) h.tick(1);
  }, s);
  await page.waitForTimeout(150);
  await page.locator('#tissue').screenshot({ path: `${outdir}/${s.name}.png` });
  await page.close();
}
// Full UI shot
const page = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 1,
});
await page.goto(`${base}/?preset=set8`);
await page.waitForTimeout(400);
await page.click('#induce');
await page.waitForTimeout(7000);
await page.screenshot({ path: `${outdir}/ui.png` });
await browser.close();
