import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto('http://localhost:4173/?test=1&n=512&dx=0.04');
await page.waitForFunction(() => window.__reentry !== undefined);
const r = await page.evaluate(() => {
  const h = window.__reentry;
  h.setStepsPerFrame(50);
  h.induce();
  const t0 = performance.now();
  h.tick(200); // 10,000 steps = 1 s simulated
  return { ms: performance.now() - t0, t: h.timeMs(), activity: h.activity() };
});
console.log(JSON.stringify(r));
await browser.close();
