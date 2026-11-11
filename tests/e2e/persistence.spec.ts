import { expect, test } from '@playwright/test';
import { box, expectPlayerClear, openApp, revealHeaders } from './helpers';

test.describe('persistence and settings (§13)', () => {
  test('assignment, layout, ratio, driver side, language, and theme survive reload', async ({ page }) => {
    await openApp(page);
    await revealHeaders(page);
    await page.getByTestId('pane-change-1').click();
    await page.getByTestId('pick-web').click();
    await page.getByTestId('divider').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('dock-settings').click();
    await page.getByTestId('setting-language').locator('[data-value="th"]').click();
    await page.getByTestId('setting-theme').locator('[data-value="neon"]').click();
    await page.getByTestId('setting-driver-side').locator('[data-value="left"]').click();
    await page.getByTestId('sheet-close').click();

    await page.reload();
    await expect(page.locator('[data-surface="web:w1"]')).toHaveAttribute('data-visible', '1');
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-driver', 'left');
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon');
    await expect(page.getByTestId('dock-swap')).toHaveAttribute('aria-label', 'สลับจอ');
    // Pane 0 has 55 %; with the driver on the left, pane 0 is the right-hand pane, so the left share reads 45 %.
    await expect(page.getByTestId('divider')).toHaveAttribute('aria-valuenow', '45');
    const dock = await box(page, '[data-chrome="dock"]');
    expect(dock.x).toBe(0);
    await expectPlayerClear(page);
  });

  test('full screen restores after reload (in-app layer) and Back still exits after the first touch', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'fullscreen');
    await page.reload();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'fullscreen');
    const s = await box(page, '[data-surface="map"]');
    await page.mouse.click(s.x + 200, s.y + 200);
    await page.goBack();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
  });

  test('reset settings needs two taps', async ({ page }) => {
    await openApp(page, { language: 'th' });
    await page.getByTestId('dock-settings').click();
    await page.getByTestId('setting-reset').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');
    await page.getByTestId('setting-reset').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
