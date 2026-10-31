// Dump pseudo-ECG samples for rhythm tuning. Usage: node scripts/ecg-dump.mjs <url-base> <preset> <seconds> <out.json>
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const [, , base, preset, seconds, out] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(`${base}/?test=1&preset=${preset}`);
await page.waitForFunction(() => window.__reentry !== undefined);
const series = await page.evaluate((secs) => {
  const h = window.__reentry;
  h.setStepsPerFrame(100);
  h.induce();
  const all = [];
  let lastT = -1;
  while (h.timeMs() < secs * 1000) {
    h.tick(1);
    const s = h.ecgSamples();
    const last = s[s.length - 1];
    if (last && last.t !== lastT) {
      all.push(last);
      lastT = last.t;
    }
  }
  return all;
}, Number(seconds));
writeFileSync(out, JSON.stringify(series));
console.log(preset, series.length, 'samples');
await browser.close();
