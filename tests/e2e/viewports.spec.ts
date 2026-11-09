import { expect, test } from '@playwright/test';
import { box, expectPlayerClear, openApp, revealHeaders, startSimulatedPlayback } from './helpers';

// Spec §12.1 sizes plus iPhone 16 Pro Max landscape (safe-area insets are not emulated here; unit tests cover them).
const SIZES: [number, number][] = [
  [800, 480],
  [1024, 600],
  [1280, 720],
  [1920, 720],
  [932, 430],
];

for (const [w, h] of SIZES) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('split keeps YouTube ≥ 356 px and clear in every state', async ({ page }) => {
      await openApp(page);
      await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
      const yt = await box(page, '[data-surface="youtube"]');
      expect(yt.width).toBeGreaterThanOrEqual(356);
      await expectPlayerClear(page);

      // Sheet open beside the player
      await revealHeaders(page);
      await page.getByTestId('pane-change-0').click();
      await expectPlayerClear(page);
      await page.getByTestId('sheet-close').click();

      // YouTube on the driver side + settings sheet
      await page.getByTestId('dock-swap').click();
      await page.getByTestId('dock-settings').click();
      await expectPlayerClear(page);
      await page.getByTestId('sheet-close').click();

      // YouTube full screen + picker
      await page.getByTestId('pane-fullscreen-1').click();
      await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'fullscreen');
      await expectPlayerClear(page);
      await page.getByTestId('fs-picker').click();
      await expectPlayerClear(page);
      await page.getByTestId('sheet-close').click();
      await page.getByTestId('fs-exit').click();

      // Mini player over another full-screen app
      await startSimulatedPlayback(page);
      await page.getByTestId('pane-fullscreen-0').click();
      await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'mini');
      await expectPlayerClear(page);
    });
  });
}
