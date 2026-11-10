// Top/bottom split on an upright phone (user request 2026-11-10). iPhone 16 Pro Max portrait CSS size.
import { expect, test } from '@playwright/test';
import { box, expectPlayerClear, openApp, revealHeaders, startSimulatedPlayback } from './helpers';

test.use({ viewport: { width: 430, height: 932 } });

const root = '#jorgu-root';

test('auto: panes stacked top/bottom, Dock along the bottom, player clear', async ({ page }) => {
  await openApp(page);
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'stacked');
  await expect(page.locator(root)).toHaveAttribute('data-mode', 'split');
  const yt = await box(page, '[data-surface="youtube"]');
  const map = await box(page, '[data-surface="map"]');
  expect(yt.width).toBe(430);
  expect(map.y).toBeGreaterThan(yt.y + yt.height - 1);
  const dock = await box(page, '[data-chrome="dock"]');
  expect(dock).toMatchObject({ x: 0, width: 430 });
  expect(dock.y + dock.height).toBe(932);
  await expect(page.getByTestId('divider')).toHaveAttribute('aria-orientation', 'horizontal');
  await expectPlayerClear(page);
});

test('dragging the divider down grows the top pane; YouTube stays ≥ 356×200', async ({ page }) => {
  await openApp(page);
  const before = await box(page, '[data-surface="youtube"]');
  const d = await box(page, '[data-testid="divider"]');
  await page.mouse.move(d.x + 300, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + 300, d.y + d.height / 2 + 120, { steps: 6 });
  await page.mouse.up();
  const after = await box(page, '[data-surface="youtube"]');
  expect(after.height).toBeGreaterThan(before.height + 60);
  await page.mouse.move(d.x + 300, d.y + 160);
  await page.mouse.down();
  await page.mouse.move(d.x + 300, 0, { steps: 6 });
  await page.mouse.up();
  await expectPlayerClear(page);
});

test('sheets slide up from the bottom and never cover the player', async ({ page }) => {
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('yt-library').click();
  const sheet = await box(page, '[data-testid="library-sheet"]');
  expect(sheet).toMatchObject({ x: 0, width: 430 });
  expect(sheet.y + sheet.height).toBe(932);
  await expectPlayerClear(page);
  await page.getByTestId('sheet-close').click();

  // YouTube in the bottom pane: the sheet comes from the top instead.
  await page.getByTestId('dock-swap').click();
  await page.getByTestId('dock-settings').click();
  const top = await box(page, '[data-testid="settings-sheet"]');
  expect(top.y).toBe(0);
  await expectPlayerClear(page);
});

test('Settings → Split screen: side by side falls back to one pane here; Auto brings top/bottom back', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-direction').locator('[data-value="side"]').click();
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'side');
  await expect(page.locator(root)).toHaveAttribute('data-mode', 'single');
  await page.getByTestId('setting-direction').locator('[data-value="auto"]').click();
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'stacked');
  await expect(page.locator(root)).toHaveAttribute('data-mode', 'split');
  await page.reload();
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'stacked');
});

test('YouTube full screen upright: controls in a row along the bottom', async ({ page }) => {
  await openApp(page);
  await revealHeaders(page);
  await page.getByTestId('pane-fullscreen-0').click();
  await expect(page.locator(root)).toHaveAttribute('data-yt', 'fullscreen');
  const row = await box(page, '[data-testid="control-column"]');
  expect(row).toMatchObject({ x: 0, width: 430 });
  expect(row.y + row.height).toBe(932);
  await expectPlayerClear(page);
  await page.getByTestId('fs-exit').click();
  await expect(page.locator(root)).toHaveAttribute('data-mode', 'split');
});

test('turning the phone sideways switches back to side by side', async ({ page }) => {
  await openApp(page);
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'stacked');
  await page.setViewportSize({ width: 932, height: 430 });
  await expect(page.locator(root)).toHaveAttribute('data-direction', 'side');
  await expect(page.locator(root)).toHaveAttribute('data-mode', 'split');
  await expectPlayerClear(page);
});
