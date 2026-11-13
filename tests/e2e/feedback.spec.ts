// User feedback batch (2026-11-11): mini player corner + grip, Dock size, ±10 s / mute, auto-continue toggle,
// Recently tab, pin from Recent / add a site.
import { expect, test, type Page, type Route } from '@playwright/test';
import { box, expectPlayerClear, mockWeb, openApp, revealHeaders, startSimulatedPlayback } from './helpers';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const v = (videoId: string, title: string) => ({ videoId, title, channel: 'Mock', thumb: '' });
const FEED = [v('M7lc1UVf-VE', 'One'), v('aqz-KE-bpKQ', 'Two'), v('dQw4w9WgXcQ', 'Three')];

async function mockAccount(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') return json({ connected: true, email: 'driver@example.com', name: 'Driver', picture: '' });
    if (url.pathname === '/api/yt/feed') return json({ items: FEED });
    if (url.pathname === '/api/yt/videos') return json({ items: [] });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"NOT_FOUND"}' });
  });
}

const queue = (page: Page) =>
  page.evaluate(() => window.__jorgu!.queue().items.map((i) => `${i.title}${(i as { auto?: boolean }).auto ? '*' : ''}`));

test('mini player: bottom corner on the driver side; the grip moves it; nothing covers it', async ({ page }) => {
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('pane-fullscreen-1').click();
  const vp = page.viewportSize()!;
  let mini = await box(page, '[data-player-rect]');
  expect(mini.x).toBeGreaterThan(vp.width / 2); // driver on the right
  expect(mini.y + mini.height).toBeGreaterThan(vp.height / 2);
  await expectPlayerClear(page);
  // Tap the grip: next corner clockwise (bottom right → bottom left).
  await page.getByTestId('mini-move').click();
  mini = await box(page, '[data-player-rect]');
  expect(mini.x).toBeLessThan(vp.width / 2);
  expect(mini.y + mini.height).toBeGreaterThan(vp.height / 2);
  await expectPlayerClear(page);
  // Drag the grip to the top right.
  const g = await box(page, '[data-testid="mini-move"]');
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.width - 40, 40, { steps: 8 });
  await page.mouse.up();
  mini = await box(page, '[data-player-rect]');
  expect(mini.x).toBeGreaterThan(vp.width / 2);
  expect(mini.y).toBeLessThan(vp.height / 2);
  await expectPlayerClear(page);
  // Remembered.
  await page.reload();
  await page.waitForFunction(() => !!window.__jorgu);
  await startSimulatedPlayback(page);
  mini = await box(page, '[data-player-rect]');
  expect(mini.y).toBeLessThan(vp.height / 2);
});

test('Dock size setting: Large makes the right toolbar wider and its buttons bigger', async ({ page }) => {
  await openApp(page);
  const before = await box(page, '[data-chrome="dock"]');
  expect(before.width).toBe(72); // as wide as the toolbar strips (user 2026-11-13)
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-dock-size').locator('[data-value="xlarge"]').click();
  await page.getByTestId('sheet-close').click();
  expect((await box(page, '[data-chrome="dock"]')).width).toBe(88);
  expect((await box(page, '[data-testid="dock-swap"]')).width).toBe(80);
  await expectPlayerClear(page);
  // The same setting sizes the transport row under the clip title and the map's buttons (user 2026-11-12) …
  expect((await box(page, '[data-testid="yt-toggle"]')).height).toBe(64);
  expect((await box(page, '[data-testid="map-recenter"]')).width).toBe(72);
  // … and the YouTube full-screen column; the player still never has anything over it.
  await page.getByTestId('pane-fullscreen-0').click();
  expect((await box(page, '[data-testid="fs-exit"]')).width).toBe(88);
  expect((await box(page, '[data-testid="control-column"]')).width % 96).toBe(0);
  await expectPlayerClear(page);
});

test('transport row: ±10 s and mute fit in the pane; on a narrow pane speed moves to the queue sheet', async ({ page }) => {
  await openApp(page);
  for (const id of ['yt-back10', 'yt-forward10', 'yt-mute', 'yt-speed']) await expect(page.getByTestId(id)).toBeVisible();
  await page.setViewportSize({ width: 932, height: 430 });
  const pane = await box(page, '[data-surface="youtube"]');
  for (const b of await page.getByTestId('yt-transport').locator('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(pane.x);
    expect(r.x + r.width).toBeLessThanOrEqual(pane.x + pane.width);
  }
  await expect(page.getByTestId('yt-back10')).toBeVisible();
  await page.getByTestId('yt-queue').click();
  for (const id of ['queue-back10', 'queue-forward10', 'queue-mute', 'queue-speed']) await expect(page.getByTestId(id)).toBeVisible();
});

test('auto-continue: a tap in New queues the rest of the list (+ first); off = just that video', async ({ page }) => {
  await mockAccount(page);
  await openApp(page);
  await page.getByTestId('yt-library').click();
  await page.getByTestId('lib-tab-feed').click();
  await page.getByTestId('lib-feed').locator('li button').first().click();
  await expect.poll(() => queue(page)).toEqual(['One', 'Two*', 'Three*']);

  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-auto-continue').locator('[data-value="off"]').click();
  await page.getByTestId('sheet-close').click();
  await page.getByTestId('yt-library').click();
  await page.getByTestId('lib-feed').locator('li').nth(1).locator('button').first().click();
  // Old auto part gone; only the tapped video added after the current one.
  await expect.poll(() => queue(page)).toEqual(['One', 'Two']);
});

test('Recently tab: works without an account, plays from there, can be cleared', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    localStorage.setItem(
      'jorgu:history',
      JSON.stringify({ state: { entries: [{ videoId: 'M7lc1UVf-VE', title: 'Played before', channel: 'Mock', at: Date.now() }] }, version: 1 }),
    ),
  );
  await page.reload();
  await page.getByTestId('yt-library').click();
  await page.getByTestId('lib-tab-recent').click();
  await expect(page.getByTestId('lib-recent')).toContainText('Played before');
  await page.getByTestId('lib-recent-clear').click();
  await expect(page.getByTestId('lib-recent-empty')).toBeVisible();
});

test('Web: pin a Recent page to the App Picker; add a site by hand', async ({ page }) => {
  await mockWeb(page);
  await openApp(page, { layout: { mode: 'split', panes: [{ kind: 'web', id: 'w1', url: '' }, { kind: 'map' }] }, web: { recent: ['https://news.test/'] } });
  await page.getByTestId('recent-pin-0').click();
  await expect(page.getByTestId('recent-pin-0')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('web-add-site').click();
  await page.getByTestId('web-add-site-url').fill('radio.test/live');
  await page.getByTestId('web-add-site-name').fill('Radio');
  await page.getByTestId('web-add-site-save').click();
  await expect(page.getByTestId('web-bookmarks')).toContainText('Radio');
  await revealHeaders(page);
  await page.getByTestId('pane-change-1').click();
  const entries = page.getByTestId('app-picker').locator('[data-testid^="pick-bookmark-"]');
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveText(/news\.test/);
});
