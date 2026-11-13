// M5 Web app (spec §9): start page, frame check card, Auto/Mobile/Desktop without reload, bookmarks → App Picker,
// http handling, full screen. Sites and /api/frame-check are mocked (the Worker side is tested in tests/worker).
import { expect, test, type Page } from '@playwright/test';
import { expectNoReloads, frameLoads, mockWeb, openApp, waitForFrames } from './helpers';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const SITE = 'https://site.test/';
const webPanes = (url: string) => ({ layout: { mode: 'split', panes: [{ kind: 'web', id: 'w1', url }, { kind: 'map' }] } });
const frame = (page: Page) => page.frameLocator('[data-testid="web-frame-w1"]');

async function openWebMenu(page: Page, pane = 0) {
  await page.getByTestId(`web-menu-${pane}`).click();
  await expect(page.getByTestId('web-sheet')).toBeVisible();
}

test('allowed site: Mobile ↔ Desktop switches the layout without reloading, and taps land through the scale', async ({ page }) => {
  const m = await mockWeb(page);
  await openApp(page, webPanes(SITE));
  await waitForFrames(page, ['web:w1']);
  expect(m.checks).toEqual([SITE]);
  const f = frame(page);
  const token = await f.locator('#token').textContent();
  const before = await frameLoads(page);
  // The header band keeps the site clear of our controls.
  const header = (await page.locator('[data-chrome="pane-header"][data-pane="0"]').boundingBox())!;
  const fr = (await page.getByTestId('web-page-w1').boundingBox())!;
  expect(fr.y).toBeGreaterThanOrEqual(header.y + header.height);

  await openWebMenu(page);
  await page.getByTestId('web-view').locator('[data-value="desktop"]').click();
  await expect(f.locator('body')).toHaveAttribute('data-layout', 'desktop');
  await expect(f.locator('body')).toHaveAttribute('data-width', '1280');
  await expect(page.getByTestId('web-sheet-reload-view')).toBeVisible();
  await page.getByTestId('web-view').locator('[data-value="mobile"]').click();
  await expect(f.locator('body')).toHaveAttribute('data-layout', 'mobile');
  await expect(f.locator('body')).toHaveAttribute('data-width', '400');
  await page.getByTestId('sheet-close').click();
  await expect(page.getByTestId('web-reload-view-0')).toBeVisible();
  // Same document: no reload.
  await expect(f.locator('#token')).toHaveText(token!);
  await expectNoReloads(page, before);
  // Scaled iframe still takes taps on the right element.
  await f.locator('#tap').click();
  await f.locator('#tap').click();
  await expect(f.locator('#count')).toHaveText('2');

  // Remembered per origin across a reload.
  await page.reload();
  await expect(page.getByTestId('web-frame-w1')).toHaveAttribute('data-view', 'mobile');
  await expect(frame(page).locator('body')).toHaveAttribute('data-width', '400');
});

test('web toolbar: Mobile / Desktop and zoom one tap away, on the driver-side edge, without reloading', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, webPanes(SITE));
  await waitForFrames(page, ['web:w1']);
  const f = frame(page);
  const token = await f.locator('#token').textContent();
  const before = await frameLoads(page);
  // A strip on the pane's right edge (driver side), the site beside it.
  const pane = (await page.locator('[data-chrome="pane-header"][data-pane="0"]').boundingBox())!;
  const strip = (await page.getByTestId('web-w1-strip').boundingBox())!;
  const site = (await page.getByTestId('web-page-w1').boundingBox())!;
  expect(Math.round(strip.x + strip.width)).toBe(Math.round(pane.x + pane.width));
  expect(Math.round(site.x + site.width)).toBe(Math.round(strip.x));
  const view = page.getByTestId('web-frame-w1');
  await page.getByTestId('web-desktop-w1').click();
  await expect(view).toHaveAttribute('data-view', 'desktop');
  await expect(page.getByTestId('web-desktop-w1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('web-mobile-w1').click();
  await expect(view).toHaveAttribute('data-view', 'mobile');
  await expect(f.locator('body')).toHaveAttribute('data-width', '400');
  // Tapping the lit button again goes back to Auto.
  await page.getByTestId('web-mobile-w1').click();
  await expect(view).toHaveAttribute('data-view', 'auto');
  await expect(page.getByTestId('web-zoom-reset-w1')).toHaveText('100%');
  // Zoom steps like a browser's; the % button shows it and puts it back to 100 %.
  await page.getByTestId('web-zoom-in-w1').click();
  await expect(page.getByTestId('web-zoom-reset-w1')).toHaveText('110%');
  await expect(view).toHaveAttribute('data-scale', '1.100');
  await page.getByTestId('web-zoom-in-w1').click();
  await expect(page.getByTestId('web-zoom-reset-w1')).toHaveText('125%');
  await page.getByTestId('web-zoom-reset-w1').click();
  await expect(view).toHaveAttribute('data-scale', '1.000');
  await page.getByTestId('web-zoom-out-w1').click();
  await expect(page.getByTestId('web-zoom-reset-w1')).toHaveText('90%');
  // Same page all along.
  await expect(f.locator('#token')).toHaveText(token!);
  await expectNoReloads(page, before);
});

test('"Reload in this view" reloads the page in place', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, webPanes(SITE));
  await waitForFrames(page, ['web:w1']);
  const token = await frame(page).locator('#token').textContent();
  await openWebMenu(page);
  await page.getByTestId('web-view').locator('[data-value="desktop"]').click();
  await page.getByTestId('web-sheet-reload-view').click();
  await expect.poll(async () => (await frameLoads(page))['web:w1']).toBe(2);
  await expect(frame(page).locator('#token')).not.toHaveText(token!);
  await expect(page.getByTestId('web-reload-0')).toBeVisible();
});

test('blocked site: card with "Open in new tab" (noopener, keeps the Referer); no iframe', async ({ page }) => {
  await mockWeb(page, { blocked: ['bank.test'] });
  await openApp(page, webPanes('https://bank.test/login'));
  const card = page.getByTestId('web-blocked-w1');
  await expect(card).toBeVisible();
  await expect(card).toContainText("This site doesn't allow being shown inside other apps");
  await expect(page.getByTestId('web-frame-w1')).toHaveCount(0);
  for (const id of ['web-blocked-newtab-w1', 'web-newtab-0']) {
    const link = page.getByTestId(id);
    await expect(link).toHaveAttribute('href', 'https://bank.test/login');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  }
  // Home goes back to the start page.
  await page.getByTestId('web-blocked-home-w1').click();
  await expect(page.getByTestId('web-start-w1')).toBeVisible();
});

test('start page: type a bare domain; bad input explains; Recent; bookmark → pin → App Picker entry', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, webPanes(''));
  await expect(page.getByTestId('web-start-w1')).toBeVisible();
  const input = page.getByTestId('web-start-url-w1-input');
  await input.fill('weather bangkok');
  await page.getByTestId('web-start-url-w1-go').click();
  await expect(page.getByTestId('web-start-url-w1-error')).toHaveText('Enter a web address like example.com');
  await input.fill('javascript:alert(1)');
  await page.getByTestId('web-start-url-w1-go').click();
  await expect(page.getByTestId('web-start-url-w1-error')).toContainText('Only web addresses');
  await input.fill('site.test');
  await page.getByTestId('web-start-url-w1-go').click();
  await waitForFrames(page, ['web:w1']);
  await expect(page.getByTestId('web-menu-0')).toContainText('site.test');

  await openWebMenu(page);
  await expect(page.getByTestId('web-recent')).toContainText('site.test');
  await page.getByTestId('web-bookmark').click();
  await expect(page.getByTestId('web-bookmark')).toHaveAttribute('aria-pressed', 'true');
  const pin = page.getByTestId('web-bookmarks').locator('[data-testid^="bookmark-pin-"]');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  // Rename.
  await page.getByTestId('web-bookmarks').locator('[data-testid^="bookmark-rename-"]').click();
  await page.getByTestId('web-bookmarks').locator('[data-testid^="bookmark-title-"]').fill('My site');
  await page.getByTestId('web-bookmarks').locator('[data-testid^="bookmark-save-"]').click();
  await page.getByTestId('sheet-close').click();

  // Pinned bookmark is a one-tap app in the picker; it opens in the map's pane.
  await page.getByTestId('pane-change-1').click();
  const entry = page.getByTestId('app-picker').locator('[data-testid^="pick-bookmark-"]');
  await expect(entry).toHaveText(/My site/);
  await entry.click();
  await expect(page.locator('[data-surface="web:w2"]')).toHaveAttribute('data-visible', '1');
  await expect(page.getByTestId('web-frame-w2')).toBeVisible();
});

test('typed http:// with no https answer: explains, offers new tab (http) or "Try https anyway"', async ({ page }) => {
  await mockWeb(page, { unknownHosts: ['plain.test'] });
  await openApp(page, webPanes('http://plain.test/'));
  await expect(page.getByTestId('web-insecure-w1')).toBeVisible();
  await expect(page.getByTestId('web-insecure-newtab-w1')).toHaveAttribute('href', 'http://plain.test/');
  await page.getByTestId('web-try-https-w1').click();
  await expect(page.getByTestId('web-frame-w1')).toHaveAttribute('src', 'https://plain.test/');
});

test('two Web panes swap without reloading either (§6.3)', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, {
    layout: { mode: 'split', panes: [{ kind: 'web', id: 'w1', url: 'https://a.test/' }, { kind: 'web', id: 'w2', url: 'https://b.test/' }] },
  });
  await waitForFrames(page, ['web:w1', 'web:w2']);
  const before = await frameLoads(page);
  const a = (await page.locator('[data-surface="web:w1"]').boundingBox())!;
  await page.getByTestId('dock-swap').click();
  const a2 = (await page.locator('[data-surface="web:w1"]').boundingBox())!;
  expect(a2.x).not.toBe(a.x);
  await expectNoReloads(page, before);
});

test('full screen: the site fills the screen, edge strip + floating Web menu; no reload in or out, or on swap', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, webPanes(SITE));
  await waitForFrames(page, ['web:w1']);
  const before = await frameLoads(page);
  await page.getByTestId('pane-fullscreen-0').click();
  await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'fullscreen');
  const vp = page.viewportSize()!;
  // The site fills the screen beside its toolbar strip (Mobile / Desktop / zoom, user 2026-11-13) on the driver side.
  const fr = (await page.getByTestId('web-page-w1').boundingBox())!;
  const strip = (await page.getByTestId('web-w1-strip').boundingBox())!;
  expect(fr).toMatchObject({ x: 0, y: 0, width: vp.width - strip.width, height: vp.height });
  expect(strip.x + strip.width).toBe(vp.width);
  await page.getByTestId('edge-strip').dispatchEvent('pointerdown');
  await page.getByTestId('fs-web-menu').click();
  await expect(page.getByTestId('web-sheet')).toBeVisible();
  await page.getByTestId('sheet-close').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
  await page.getByTestId('dock-swap').click();
  await expectNoReloads(page, before);
});
