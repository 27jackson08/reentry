import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto('http://localhost:4173/?test=1'); // paused: loop renders but does not step
await page.waitForFunction(() => window.__reentry !== undefined);
const measure = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const loop = () => {
          frames++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
          else resolve(frames / 2);
        };
        requestAnimationFrame(loop);
      }),
  );
const idle = await measure();
await page.evaluate(() => {
  window.__reentry.setStepsPerFrame(40);
  window.__reentry.induce();
});
await page.evaluate(() => {
  const b = document.getElementById('pause');
  if (b.textContent === 'Run') b.click();
});
const running = await measure();
const heavy = await page.evaluate(async () => {
  const h = window.__reentry;
  h.setStepsPerFrame(150);
  return new Promise((resolve) => {
    let f = 0;
    const t0 = performance.now();
    const loop = () => {
      f++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
      else resolve(f / 2);
    };
    requestAnimationFrame(loop);
  });
});
console.log(
  JSON.stringify({
    idle,
    running40: running,
    running150: heavy,
    screen: await page.evaluate(() => `${screen.width}x${screen.height}`),
  }),
);
await browser.close();
