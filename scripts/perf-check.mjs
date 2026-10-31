// Live performance check on the real GPU: fps, per-phase CPU time, throttle state and readouts.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto('http://localhost:4173/?stats=1');
await page.waitForTimeout(9000);
const r = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const s = window.__frameStats;
      const start = { ...s };
      let frames = 0;
      const t0 = performance.now();
      const loop = () => {
        frames++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
        else {
          const n = s.frames - start.frames;
          resolve({
            fps: frames / 2,
            cpuMsPerFrame: {
              tick: +((s.tick - start.tick) / n).toFixed(2),
              render: +((s.render - start.render) / n).toFixed(2),
              hud: +((s.hud - start.hud) / n).toFixed(2),
            },
            msPerFrame: document.getElementById('speed').value,
            hud: ['hud-time', 'hud-rate', 'hud-rhythm', 'hud-rotors', 'hud-status'].map(
              (id) => document.getElementById(id).textContent,
            ),
          });
        }
      };
      requestAnimationFrame(loop);
    }),
);
console.log(JSON.stringify(r));
await browser.close();
