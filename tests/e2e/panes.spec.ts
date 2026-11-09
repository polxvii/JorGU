import { expect, test } from '@playwright/test';
import { box, expectNoReloads, expectPlayerClear, frameLoads, openApp, revealHeaders, waitForFrames } from './helpers';

test.describe('pane system (§6)', () => {
  test('defaults: split, YouTube left, Map right, Dock right', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
    const yt = await box(page, '[data-surface="youtube"]');
    const map = await box(page, '[data-surface="map"]');
    const dock = await box(page, '[data-chrome="dock"]');
    expect(yt.x).toBe(0);
    expect(map.x).toBeGreaterThan(yt.x + yt.width);
    expect(dock.x + dock.width).toBe(1024);
    await expectPlayerClear(page);
  });

  test('Dock ⇄ swaps panes without reloading iframes', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    await page.getByTestId('dock-swap').click();
    const yt = await box(page, '[data-surface="youtube"]');
    const map = await box(page, '[data-surface="map"]');
    expect(yt.x).toBeGreaterThan(map.x);
    await expectNoReloads(page, before);
    await expectPlayerClear(page);
  });

  test('dragging a pane header onto the other pane swaps', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    await revealHeaders(page);
    const h = await box(page, '[data-chrome="pane-header"][data-pane="0"]');
    const target = await box(page, '[data-surface="map"]');
    await page.mouse.move(h.x + 60, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + 120, h.y + 30, { steps: 5 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await expect(page.locator('[data-chrome="pane-header"][data-pane="1"]')).toHaveClass(/bg-accent/);
    await page.mouse.up();
    const yt = await box(page, '[data-surface="youtube"]');
    expect(yt.x).toBeGreaterThan(400);
    await expectNoReloads(page, before);
  });

  test('App Picker assigns apps; picking a singleton from the other pane swaps', async ({ page }) => {
    await openApp(page);
    await revealHeaders(page);
    await page.getByTestId('pane-change-1').click();
    await expect(page.getByTestId('app-picker')).toBeVisible();
    await expectPlayerClear(page);
    await page.getByTestId('pick-dashboard').click();
    await expect(page.locator('[data-surface="dashboard"]')).toHaveAttribute('data-visible', '1');
    await expect(page.locator('[data-surface="map"]')).toHaveAttribute('data-visible', '0');

    await revealHeaders(page);
    await page.getByTestId('pane-change-1').click();
    await page.getByTestId('pick-youtube').click();
    const yt = await box(page, '[data-surface="youtube"]');
    const dash = await box(page, '[data-surface="dashboard"]');
    expect(yt.x).toBeGreaterThan(dash.x);
  });

  test('two Web panes swap without reloading either', async ({ page }) => {
    await openApp(page);
    await revealHeaders(page);
    await page.getByTestId('pane-change-0').click();
    await page.getByTestId('pick-web').click();
    await revealHeaders(page);
    await page.getByTestId('pane-change-1').click();
    await page.getByTestId('pick-web').click();
    await waitForFrames(page, ['web:w1', 'web:w2']);
    const before = await frameLoads(page);
    const a = await box(page, '[data-surface="web:w1"]');
    await page.getByTestId('dock-swap').click();
    const a2 = await box(page, '[data-surface="web:w1"]');
    expect(a2.x).not.toBe(a.x);
    await expectNoReloads(page, before);
  });

  test('layout toggle: single shows the focused pane; split restores both', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    await page.getByTestId('dock-layout').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'single');
    // Default focused pane is the driver-side pane (Map); YouTube is paused, so it hides.
    await expect(page.locator('[data-surface="map"]')).toHaveAttribute('data-visible', '1');
    await expect(page.locator('[data-surface="youtube"]')).toHaveAttribute('data-visible', '0');
    await page.getByTestId('dock-layout').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
    await expectNoReloads(page, before);
  });

  test('single layout with YouTube playing off-pane shows the mini player', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('yt-toggle').click();
    // Tapping the toggle focused the YouTube pane; focus the Map pane so single layout shows Map.
    const map = await box(page, '[data-surface="map"]');
    await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
    await page.getByTestId('dock-layout').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'mini');
    await expectPlayerClear(page);
    await page.getByTestId('mini-restore').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'pane');
  });

  test('headers auto-hide after 4 s and come back on touch; ⛶ stays visible', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    const header = page.locator('[data-chrome="pane-header"][data-pane="1"]');
    await expect(header).toBeVisible();
    await page.clock.fastForward(4500);
    await expect(header).toBeHidden();
    await expect(page.getByTestId('pane-fullscreen-1')).toBeVisible();
    await revealHeaders(page);
    await expect(header).toBeVisible();
  });
});
