// Record probe snapshots every N ms within a window. Usage: node scripts/probe-dump-fine.mjs <url-base> <preset> <fromMs> <toMs> <everyMs> <out.json>
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const [, , base, preset, fromMs, toMs, everyMs, out] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(`${base}/?test=1&preset=${preset}${process.env.GRID ?? ''}`);
await page.waitForFunction(() => window.__reentry !== undefined);
const snaps = await page.evaluate(
  ({ fromMs, toMs, everyMs }) => {
    const h = window.__reentry;
    h.setStepsPerFrame(50);
    h.induce();
    while (h.timeMs() < fromMs) h.tick(1);
    h.setStepsPerFrame(Math.max(1, Math.round(everyMs / 0.1)));
    const out = [];
    while (h.timeMs() < toMs) {
      h.tick(1);
      const p = h.probe();
      const u = [];
      for (let k = 0; k < 64 * 64; k++) u.push(Number(p[k * 4].toFixed(4)));
      out.push({ t: Math.round(h.timeMs()), u });
    }
    return out;
  },
  { fromMs: Number(fromMs), toMs: Number(toMs), everyMs: Number(everyMs) },
);
writeFileSync(out, JSON.stringify(snaps));
console.log(preset, snaps.length, 'snapshots');
await browser.close();
