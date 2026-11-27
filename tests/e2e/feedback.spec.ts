// User feedback batch (2026-11-11): mini player corner + grip, Dock size, ±10 s / mute, when the queue ends,
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
  // Drag the grip to the top right: as far as it goes, so the corner.
  let g = await box(page, '[data-testid="mini-move"]');
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.width - 40, 40, { steps: 8 });
  await page.mouse.up();
  mini = await box(page, '[data-player-rect]');
  expect(mini.x).toBeGreaterThan(vp.width / 2);
  expect(mini.y).toBeLessThan(vp.height / 2);
  await expectPlayerClear(page);
  // Anywhere, not only the corners (user 2026-11-27): it follows the finger and stays where it's let go.
  g = await box(page, '[data-testid="mini-move"]');
  const from = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 300, from.y + 120, { steps: 4 });
  const during = await box(page, '[data-player-rect]');
  expect(Math.abs(during.x - (mini.x - 300))).toBeLessThan(2);
  await page.mouse.move(from.x - 330, from.y + 150, { steps: 4 });
  await page.mouse.up();
  const dropped = await box(page, '[data-player-rect]');
  expect(Math.abs(dropped.x - (mini.x - 330))).toBeLessThan(2);
  expect(Math.abs(dropped.y - (mini.y + 150))).toBeLessThan(2);
  await expectPlayerClear(page);
  // Settings shows no corner picked now.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jorgu:settings')!).state.youtube.miniAt)).not.toBeNull();
  // Remembered.
  await page.reload();
  await page.waitForFunction(() => !!window.__jorgu);
  await startSimulatedPlayback(page);
  mini = await box(page, '[data-player-rect]');
  expect(Math.abs(mini.x - dropped.x)).toBeLessThan(2);
  expect(Math.abs(mini.y - dropped.y)).toBeLessThan(2);
  // A tap on the grip goes back to the corners.
  await page.getByTestId('mini-move').click();
  mini = await box(page, '[data-player-rect]');
  expect([12, vp.width - 12 - mini.width]).toContain(Math.round(mini.x));
});

test('mini player any size (user 2026-11-27): drag the ⤡ grip outward to grow it, a tap steps sizes; 16:9, never under 356×200', async ({ page }) => {
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('pane-fullscreen-1').click();
  let mini = await box(page, '[data-player-rect]');
  expect([mini.width, mini.height]).toEqual([356, 200]);
  // Bottom right: the grip is at the left end of the handle; dragging it left grows the player up and left.
  const g = await box(page, '[data-testid="mini-resize"]');
  expect(g.x).toBeLessThan(mini.x + 60);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - 150, g.y + g.height / 2, { steps: 6 });
  await expect.poll(async () => (await box(page, '[data-player-rect]')).width).toBe(506);
  await page.mouse.move(g.x + g.width / 2 - 244, g.y + g.height / 2, { steps: 4 });
  await page.mouse.up();
  mini = await box(page, '[data-player-rect]');
  expect([mini.width, mini.height]).toEqual([600, 338]);
  expect(mini.x + mini.width).toBe(1024 - 12);
  expect(mini.y + mini.height).toBe(600 - 12);
  await expectPlayerClear(page);
  // Shrinking stops at 356×200.
  const g2 = await box(page, '[data-testid="mini-resize"]');
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2.x + g2.width / 2 + 600, g2.y + g2.height / 2, { steps: 6 });
  await page.mouse.up();
  mini = await box(page, '[data-player-rect]');
  expect([mini.width, mini.height]).toEqual([356, 200]);
  // A tap steps through 356 / 480 / 640 / 800 (as far as it fits; 600 high fits 800).
  await page.getByTestId('mini-resize').click();
  expect((await box(page, '[data-player-rect]')).width).toBe(480);
  await page.getByTestId('mini-resize').click();
  await page.getByTestId('mini-resize').click();
  expect((await box(page, '[data-player-rect]')).width).toBe(800);
  await expectPlayerClear(page);
  // Remembered.
  await page.reload();
  await page.waitForFunction(() => !!window.__jorgu);
  await startSimulatedPlayback(page);
  expect((await box(page, '[data-player-rect]')).width).toBe(800);
});

test('a big mini player makes room for a sheet (moves / shrinks, never under 356×200); a size in Settings replaces the dragged one', async ({ page }) => {
  await openApp(page, { layout: { mode: 'single', focusedPane: 1 }, youtube: { miniWidth: 700 } });
  await startSimulatedPlayback(page);
  expect((await box(page, '[data-player-rect]')).width).toBe(700);
  await page.getByTestId('dock-settings').click();
  const sheet = await box(page, '[data-chrome="sheet"]');
  const mini = await box(page, '[data-player-rect]');
  expect(sheet.width).toBeGreaterThanOrEqual(300);
  expect(mini.width).toBeGreaterThanOrEqual(356);
  expect(mini.width).toBeLessThan(700);
  await expectPlayerClear(page);
  await page.getByTestId('setting-mini-size').locator('[data-value="356x200"]').click();
  expect((await box(page, '[data-player-rect]')).width).toBe(356);
  await page.getByTestId('sheet-close').click();
  expect((await box(page, '[data-player-rect]')).width).toBe(356);
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
  // (In two panes the row under the player shrinks to stay on one line, user 2026-11-13: 64 px × its scale.)
  const k = Number(await page.getByTestId('yt-transport').getAttribute('data-scale'));
  expect(k).toBeGreaterThan(0.6);
  expect((await box(page, '[data-testid="yt-toggle"]')).height).toBe(Math.round(64 * k));
  expect((await box(page, '[data-testid="yt-transport"]')).height).toBeLessThan(2 * 64);
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

test('when the queue ends: rest of the list (default) / stop; no Mix (removed 2026-11-16)', async ({ page }) => {
  await mockAccount(page);
  await openApp(page);
  // Real playback would mark clips as played and New would hide them: keep them listed for this test.
  await page.getByTestId('dock-settings').click();
  const choices = page.getByTestId('setting-auto-continue').locator('[data-value]');
  await expect(choices).toHaveCount(2);
  await expect(page.getByTestId('setting-auto-continue').locator('[data-value="list"]')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('setting-hide-played').locator('[data-value="off"]').click();
  await page.getByTestId('sheet-close').click();
  const tap = async (title: string) => {
    await page.getByTestId('yt-library').click();
    await page.getByTestId('lib-tab-feed').click();
    await page.getByTestId('lib-feed').locator('li', { hasText: title }).locator('button').first().click();
  };
  await tap('One');
  await expect.poll(() => queue(page)).toEqual(['One', 'Two*', 'Three*']);

  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-auto-continue').locator('[data-value="off"]').click();
  await page.getByTestId('sheet-close').click();
  await tap('Two');
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
