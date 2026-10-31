import { chromium } from '@playwright/test';
const [, , url, out, script] = process.argv;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text());
});
await page.goto(url);
await page.waitForFunction(() => window.__reentry !== undefined);
if (script) await page.evaluate(script);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
