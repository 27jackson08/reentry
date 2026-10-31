// Antitachycardia pacing against a rotor anchored on a scar patch (anatomical reentry, ~232 ms).
// Usage: node scripts/pacing-anchored.mjs <url-base>
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const [, , base] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(`${base}/?test=1&preset=set1&scar=ZmgAM`);
await page.waitForFunction(() => window.__reentry !== undefined);
const rows = ['case,site,cl_ms,beats,activity_before,activity_after,rotors_after,terminated'];
const SITES = { far: { cx: 0.2, cy: 0.8 }, near: { cx: 0.25, cy: 0.5 } };
for (const [siteName, site] of Object.entries(SITES)) {
  for (const cl of [160, 180, 200, 215, 230]) {
    for (const beats of [10, 20]) {
      const r = await page.evaluate(
        ({ cl, beats, site }) => {
          const h = window.__reentry;
          h.reset();
          h.setStepsPerFrame(100);
          h.induce();
          while (h.timeMs() < 4000) h.tick(1);
          const before = h.activity();
          h.pace(cl, beats, site);
          while (h.isPacing()) h.tick(1);
          const end = h.timeMs();
          while (h.timeMs() < end + 3000) h.tick(1);
          return { before, after: h.activity(), rotors: h.rotors().length };
        },
        { cl, beats, site },
      );
      rows.push(
        `anchored,${siteName},${cl},${beats},${r.before.toFixed(2)},${r.after.toFixed(2)},${r.rotors},${r.after === 0 ? 1 : 0}`,
      );
      console.log(rows[rows.length - 1]);
    }
  }
}
writeFileSync('docs/results/pacing.csv', rows.join('\n') + '\n');
await browser.close();
