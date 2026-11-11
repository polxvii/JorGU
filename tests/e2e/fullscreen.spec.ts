import { expect, test, type Page } from '@playwright/test';
import { box, expectNoReloads, expectPlayerClear, frameLoads, openApp, startSimulatedPlayback } from './helpers';

const root = (page: Page) => page.locator('#jorgu-root');
const browserFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement === document.documentElement);

async function showFloatingBar(page: Page) {
  const s = await box(page, '[data-surface="map"]');
  await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
  await expect(page.getByTestId('floating-bar')).toBeVisible();
}

test.describe('per-pane full screen (§6.5)', () => {
  // Browser full screen is per window; run these one at a time to avoid cross-test interference.
  test.describe.configure({ mode: 'serial' });

  test('⛶ enters in one tap (in-app + browser full screen); ✕ exits', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await expect(root(page)).toHaveAttribute('data-mode', 'fullscreen');
    await expect(page.locator('[data-chrome="dock"]')).toHaveCount(0);
    const map = await box(page, '[data-surface="map"]');
    expect(map).toEqual({ x: 0, y: 0, width: 1024, height: 600 });
    await expect.poll(() => browserFullscreen(page)).toBe(true);

    await showFloatingBar(page);
    await page.getByTestId('fs-exit').click();
    await expect(root(page)).toHaveAttribute('data-mode', 'split');
    await expect.poll(() => browserFullscreen(page)).toBe(false);
    await expectNoReloads(page, before);
  });

  test('Esc exits', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await expect(root(page)).toHaveAttribute('data-mode', 'fullscreen');
    await page.keyboard.press('Escape');
    await expect(root(page)).toHaveAttribute('data-mode', 'split');
  });

  test('Back exits full screen instead of leaving the app', async ({ page }) => {
    await openApp(page);
    const url = page.url();
    await page.getByTestId('pane-fullscreen-1').click();
    await expect(root(page)).toHaveAttribute('data-mode', 'fullscreen');
    await page.goBack();
    await expect(root(page)).toHaveAttribute('data-mode', 'split');
    expect(page.url()).toBe(url);
    await expect.poll(() => browserFullscreen(page)).toBe(false);
  });

  test('browser leaving full screen by itself also exits in-app full screen', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await expect.poll(() => browserFullscreen(page)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect(root(page)).toHaveAttribute('data-mode', 'split');
  });

  test('⇄ switches the full-screen app; YouTube full screen has a control column beside the player', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await showFloatingBar(page);
    await page.getByTestId('fs-switch').click();
    await expect(root(page)).toHaveAttribute('data-yt', 'fullscreen');
    await expect(page.getByTestId('control-column')).toBeVisible();
    await expectPlayerClear(page);
    await page.getByTestId('fs-switch').click();
    await expect(root(page)).toHaveAttribute('data-yt', 'hidden');
    await expectNoReloads(page, before);
    await expect.poll(() => browserFullscreen(page)).toBe(true);
  });

  test('playing YouTube becomes the mini player and nothing covers it', async ({ page }) => {
    await openApp(page);
    await startSimulatedPlayback(page);
    const before = await frameLoads(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await expect(root(page)).toHaveAttribute('data-yt', 'mini');
    const mini = await box(page, '[data-player-rect]');
    expect(mini.width).toBe(356);
    expect(mini.height).toBe(200);
    expect(mini.x).toBeLessThan(512); // passenger side (driver right)
    await showFloatingBar(page);
    await expectPlayerClear(page);
    await page.getByTestId('fs-picker').click();
    await expect(page.getByTestId('app-picker')).toBeVisible();
    await expectPlayerClear(page);
    await page.getByTestId('sheet-close').click();
    await page.getByTestId('mini-restore').click();
    await expect(root(page)).toHaveAttribute('data-yt', 'fullscreen');
    await expectPlayerClear(page);
    await expectNoReloads(page, before);
  });

  test('App Picker in full screen changes the full-screen app', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('pane-fullscreen-1').click();
    await showFloatingBar(page);
    await page.getByTestId('fs-picker').click();
    await page.getByTestId('pick-web').click();
    await expect(page.locator('[data-surface="web:w1"]')).toHaveAttribute('data-visible', '1');
    await expect(root(page)).toHaveAttribute('data-mode', 'fullscreen');
  });

  test('double-tap on a pane header enters full screen', async ({ page }) => {
    await openApp(page);
    const h = await box(page, '[data-chrome="pane-header"][data-pane="1"]');
    await page.mouse.dblclick(h.x + 80, h.y + h.height / 2);
    await expect(root(page)).toHaveAttribute('data-mode', 'fullscreen');
  });
});
