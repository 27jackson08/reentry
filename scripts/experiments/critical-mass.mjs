// Critical mass for reentry: induce on sheets of increasing size at fixed grid
// spacing and record how long activity survives.
// Usage: node scripts/experiments/critical-mass.mjs <url-base> <out.csv>
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [, , base, out] = process.argv;
const PRESETS = ['set1', 'set3', 'set8', 'set10', 'mlr1'];
const SIZES = [128, 192, 256, 320, 384, 448, 512];
const DX = 0.04;
const MAX_MS = 8000;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const rows = ['preset,n,side_cm,survival_ms,censored,rotors_at_end'];
for (const preset of PRESETS) {
  for (const n of SIZES) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${base}/?test=1&preset=${preset}&n=${n}&dx=${DX}`);
    await page.waitForFunction(() => window.__reentry !== undefined);
    const r = await page.evaluate((maxMs) => {
      const h = window.__reentry;
      h.setStepsPerFrame(100);
      h.induce();
      let lastActive = 0;
      while (h.timeMs() < maxMs) {
        h.tick(1);
        if (h.activity() > 0) lastActive = h.timeMs();
        // Quiescent for 300 ms after S2 has fired: reentry is over.
        else if (h.status() !== 'inducing' && h.timeMs() - lastActive > 300 && h.timeMs() > 800)
          break;
      }
      const censored = h.activity() > 0 && h.timeMs() >= maxMs;
      return {
        survival: Math.round(censored ? maxMs : lastActive),
        censored,
        rotors: h.rotors().length,
      };
    }, MAX_MS);
    rows.push(
      `${preset},${n},${(n * DX).toFixed(2)},${r.survival},${r.censored ? 1 : 0},${r.rotors}`,
    );
    console.log(rows[rows.length - 1]);
    await page.close();
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.join('\n') + '\n');
await browser.close();
