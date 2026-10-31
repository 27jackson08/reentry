// Render SVG files to PNG for previews. Usage: node scripts/svg-to-png.mjs <in.svg> <out.png> [...]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const browser = await chromium.launch();
for (let i = 0; i + 1 < args.length; i += 2) {
  const page = await browser.newPage({
    viewport: { width: 740, height: 420 },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    `<body style="margin:10px;background:#0f0e14">${readFileSync(args[i], 'utf8')}</body>`,
  );
  await page.screenshot({ path: args[i + 1] });
  await page.close();
}
await browser.close();
