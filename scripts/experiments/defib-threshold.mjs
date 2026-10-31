// Defibrillation threshold: shock amplitude vs termination, for a stable rotor
// and for fibrillation, at three timings. Usage: node scripts/experiments/defib-threshold.mjs <url-base> <out.csv>
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [, , base, out] = process.argv;
const CASES = [
  { preset: 'set1', label: 'stable rotor', shockAt: [3000, 3130, 3260] },
  { preset: 'set3', label: 'fibrillation', shockAt: [2500, 2700, 2900] },
];
const STRENGTHS = [0.01, 0.02, 0.024, 0.026, 0.028, 0.03, 0.034, 0.04, 0.06, 0.1, 0.2, 0.4, 0.6];
const SETTLE_MS = 1500;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const rows = ['preset,label,shock_at_ms,strength,terminated,activity_after,rotors_after'];
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${base}/?test=1&preset=${c.preset}`);
  await page.waitForFunction(() => window.__reentry !== undefined);
  for (const shockAt of c.shockAt) {
    for (const strength of STRENGTHS) {
      const r = await page.evaluate(
        ({ shockAt, strength, settle }) => {
          const h = window.__reentry;
          h.reset();
          h.setStepsPerFrame(100);
          h.induce();
          while (h.timeMs() < shockAt) h.tick(1);
          const before = h.activity();
          h.shock(strength, 5);
          while (h.timeMs() < shockAt + settle) h.tick(1);
          return { before, after: h.activity(), rotors: h.rotors().length };
        },
        { shockAt, strength, settle: SETTLE_MS },
      );
      if (r.before === 0) continue; // nothing to terminate (set 3 may have self-terminated)
      rows.push(
        `${c.preset},${c.label},${shockAt},${strength},${r.after === 0 ? 1 : 0},${r.after.toFixed(3)},${r.rotors}`,
      );
      console.log(rows[rows.length - 1]);
    }
  }
  await page.close();
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.join('\n') + '\n');
await browser.close();
