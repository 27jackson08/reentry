// Open the deployed site on the real GPU, induce, and report HUD readouts.
import { chromium } from '@playwright/test';
const [, , url, out] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(1500);
await page.click('#induce');
await page.waitForTimeout(8000);
const hud = await page.evaluate(() => ({
  time: document.getElementById('hud-time').textContent,
  speed: document.getElementById('hud-rate').textContent,
  status: document.getElementById('hud-status').textContent,
  steps: document.getElementById('speed').value,
}));
if (out) await page.screenshot({ path: out });
console.log(JSON.stringify({ hud, errors }));
await browser.close();
