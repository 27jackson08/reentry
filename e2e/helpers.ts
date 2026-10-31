import type { Page } from '@playwright/test';
import type { ReentryTestHook } from '../src/testHook';

declare global {
  interface Window {
    __reentry: ReentryTestHook;
  }
}

export async function openSim(page: Page, query: Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams({ test: '1', ...query }).toString();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?${search}`);
  await page.waitForFunction(() => typeof window.__reentry !== 'undefined', null, {
    timeout: 20_000,
  });
  if (errors.length) throw new Error(`Page errors during startup:\n${errors.join('\n')}`);
}
