// Screenshots at the standard breakpoints. Usage: node scripts/breakpoints.mjs <url> <outdir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , url, outdir] = process.argv;
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const width of [320, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 700 : 900 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__reentry !== undefined);
  await page.evaluate(() => {
    const h = window.__reentry;
    h.setStepsPerFrame(20);
    h.induce();
    h.tick(150);
  });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  await page.screenshot({ path: `${outdir}/w${width}.png`, fullPage: true });
  console.log(width, overflow ? 'HORIZONTAL OVERFLOW' : 'ok');
  await page.close();
}
await browser.close();
