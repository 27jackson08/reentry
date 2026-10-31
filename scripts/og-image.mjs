// 1200x630 social preview from the live app on the real GPU. Usage: node scripts/og-image.mjs <url-base> <out.png>
import { chromium } from '@playwright/test';
const [, , base, out] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(`${base}/?test=1`);
await page.waitForFunction(() => window.__reentry !== undefined);
await page.evaluate(() => {
  const h = window.__reentry;
  h.setStepsPerFrame(100);
  h.induce();
  while (h.timeMs() < 6000) h.tick(1);
});
await page.waitForTimeout(3200);
await page.click('#pause'); // run, so the speed cell shows a rate rather than "paused"
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
