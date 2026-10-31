// Full-page screenshot using the real GPU (headed). Usage: node scripts/shot-gpu.mjs <url> <out.png> <setup-js> [frames]
import { chromium } from '@playwright/test';
const [, , url, out, setup, frames = '0'] = process.argv;
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__reentry !== undefined);
await page.evaluate(setup);
await page.evaluate((n) => window.__reentry.tick(Number(n)), frames);
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
