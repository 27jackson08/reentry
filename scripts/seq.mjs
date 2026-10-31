// Usage: node scripts/seq.mjs <url> <outdir> <setup-js> <frames>:<name> [<frames>:<name> ...]
// Opens the page with the test hook, runs setup, then alternates ticks and screenshots.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , url, outdir, setup, ...shots] = process.argv;
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__reentry !== undefined);
await page.evaluate(setup);
for (const spec of shots) {
  const [frames, name] = spec.split(':');
  const info = await page.evaluate((n) => {
    const h = window.__reentry;
    h.tick(Number(n));
    return { t: h.timeMs(), activity: h.activity(), status: h.status() };
  }, frames);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
await browser.close();
