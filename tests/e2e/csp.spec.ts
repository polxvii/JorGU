import { expect, test } from '@playwright/test';
import { openApp, revealHeaders, startSimulatedPlayback } from './helpers';

// `vite preview` serves the production CSP from public/_headers (see vite.config.ts).
test('production CSP: no console errors or blocked resources while using the shell (§15)', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const res = await page.goto('/');
  expect(res!.headers()['content-security-policy']).toContain("default-src 'self'");
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  await startSimulatedPlayback(page);
  await page.getByTestId('dock-swap').click();
  await page.getByTestId('pane-fullscreen-0').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-language').locator('[data-value="th"]').click();
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('sheet-close').click();
  await revealHeaders(page);

  expect(problems).toEqual([]);
  const failedFonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family));
  expect(failedFonts).toEqual([]);
});
