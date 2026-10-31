// Survey every preset: induce a spiral on a large sheet, screenshot the tissue
// at several times, and record activity. Usage: node scripts/survey.mjs <url-base> <outdir> [n] [dx]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PRESETS } from '../src/model/presets.ts';
const [, , base, outdir, n = '512', dx = '0.04'] = process.argv;
mkdirSync(outdir, { recursive: true });
// Headed so Chromium uses the real GPU; SwiftShader is ~50x slower at 512².
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const summary = {};
for (const preset of PRESETS) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(`${base}/?test=1&n=${n}&dx=${dx}&preset=${preset.id}`);
  await page.waitForFunction(() => window.__reentry !== undefined);
  await page.evaluate(() => {
    window.__reentry.setStepsPerFrame(50);
    window.__reentry.induce();
  });
  const rows = [];
  let lastT = 0;
  for (const targetMs of [600, 1200, 2500, 4000, 6000]) {
    const info = await page.evaluate((target) => {
      const h = window.__reentry;
      while (h.timeMs() < target) h.tick(1);
      return {
        t: Math.round(h.timeMs()),
        activity: Number(h.activity().toFixed(3)),
        status: h.status(),
      };
    }, targetMs);
    rows.push(info);
    lastT = info.t;
    await page.locator('#tissue').screenshot({ path: `${outdir}/${preset.id}_${targetMs}.png` });
  }
  summary[preset.id] = rows;
  console.log(preset.id, JSON.stringify(rows));
  void lastT;
  await page.close();
}
writeFileSync(`${outdir}/summary.json`, JSON.stringify(summary, null, 2));
await browser.close();
