// M4 Map app (spec §7). Google Maps is a stub (helpers.ts): these tests check what JorGu asks Google for, never real maps.
import { expect, test, type Page } from '@playwright/test';
import { box, expectPlayerClear, openApp, startSimulatedPlayback } from './helpers';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const HERE = { latitude: 13.7563, longitude: 100.5018 };
const stub = (page: Page) => page.evaluate(() => ({ ...window.__mapsStub!, listeners: undefined, fire: undefined }));

async function withLocation(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(HERE);
}

test('one map for the whole session: swaps, single/split and full screen never create another (one billed load)', async ({ page }) => {
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  expect((await stub(page)).mapId).toBe('e2e-map-id');
  await page.getByTestId('dock-swap').click();
  await page.getByTestId('dock-layout').click();
  await page.getByTestId('dock-layout').click();
  await page.getByTestId('pane-fullscreen-0').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-surface="map"]')).toHaveAttribute('data-visible', '1');
  expect((await stub(page)).maps).toBe(1);
  await page.getByTestId('dock-settings').click();
  await expect(page.getByTestId('setting-map-usage-map')).toContainText('9,919 left this month (1 / 9,920) · today 1 / 320');
  await expect(page.getByTestId('setting-map-usage-route')).toContainText('9,920 left');
});

test('follow, recenter, traffic, zoom', async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await expect.poll(async () => (await stub(page)).panTo).toBeGreaterThan(0);
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  // Dragging the map pauses follow; Recenter brings it back.
  await page.evaluate(() => window.__mapsStub!.fire('dragstart'));
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('map-recenter').click();
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  // Traffic is on by default (user request); the button turns it off and on again.
  await expect.poll(async () => (await stub(page)).traffic).toBe(true);
  await expect(page.getByTestId('map-traffic')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('map-traffic').click();
  expect((await stub(page)).traffic).toBe(false);
  await page.getByTestId('map-traffic').click();
  expect((await stub(page)).traffic).toBe(true);
  await page.getByTestId('map-zoom-in').click();
  expect((await stub(page)).zoom).toBe(16);
});

test('Navigate (default): Google Maps gets the destination; the route shows in the free Embed view, no Routes call', async ({ page }) => {
  await withLocation(page);
  await page.context().route(/^https:\/\/www\.google\.com\/maps\/dir\//, (r) => r.fulfill({ contentType: 'text/html', body: 'maps' }));
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('map-dest-go').click();
  await (await popup).close();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('src', /\/maps\/embed\/v1\/directions\?.*destination=Central\+World/);
  const s = await stub(page);
  expect(s.routes).toBe(0);
  expect(s.maps).toBe(1);
  // Switch to the live map with traffic (same map, no new load) and back.
  await page.getByTestId('map-route-live').click();
  await expect(page.getByTestId('map-embed')).toHaveCount(0);
  await expect(page.getByTestId('map-traffic')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('map-route-live').click();
  await expect(page.getByTestId('map-embed')).toBeVisible();
  expect((await stub(page)).maps).toBe(1);
  await page.getByTestId('map-route-end').click();
  await expect(page.getByTestId('map-embed')).toHaveCount(0);
});

test('Navigate with the route line on: opens Google Maps and draws the line (Routes, Essentials only, no turn list)', async ({ page }) => {
  await withLocation(page);
  // The Maps link opens a new tab; answer it locally.
  await page.context().route(/^https:\/\/www\.google\.com\/maps\/dir\//, (r) => r.fulfill({ contentType: 'text/html', body: 'maps' }));
  await openApp(page, { map: { routeLine: true } });
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  const go = page.getByTestId('map-dest-go');
  const href = new URL((await go.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://www.google.com/maps/dir/');
  expect(href.searchParams.get('destination')).toBe('Central World');
  expect(href.searchParams.get('dir_action')).toBe('navigate');
  await expect(go).toHaveAttribute('target', '_blank');
  await expect(go).toHaveAttribute('rel', 'noopener');
  const popup = page.waitForEvent('popup');
  await go.click();
  await (await popup).close();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('map-route-detail')).toContainText('km');
  const s = await stub(page);
  expect(s.routes).toBe(1);
  expect(s.lines).toBe(1);
  expect(s.lastRoute).toMatchObject({ destination: 'Central World', routingPreference: 'TRAFFIC_UNAWARE', fields: ['durationMillis', 'distanceMeters', 'path'] });
  // Refresh within a minute does nothing (≤ 1 route per minute).
  await page.getByTestId('map-route-refresh').click();
  expect((await stub(page)).routes).toBe(1);
  await page.getByTestId('map-route-end').click();
  await expect(page.getByTestId('map-route')).toHaveCount(0);
  expect((await stub(page)).lines).toBe(0);
  // Remembered as a recent destination.
  await page.getByTestId('map-navigate').click();
  await expect(page.getByTestId('map-recent')).toContainText('Central World');
});

test('saved places: add one, navigate from it', async ({ page }) => {
  await withLocation(page);
  await page.context().route(/^https:\/\/www\.google\.com\/maps\/dir\//, (r) => r.fulfill({ contentType: 'text/html', body: 'maps' }));
  await openApp(page);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-add-place').click();
  await page.getByTestId('map-place-label').fill('Home');
  await page.getByTestId('map-place-query').fill('Sukhumvit 24');
  await page.getByTestId('map-place-save').click();
  const place = page.getByTestId('map-places').locator('a');
  await expect(place).toContainText('Home');
  expect(new URL((await place.getAttribute('href'))!).searchParams.get('destination')).toBe('Sukhumvit 24');
});

test('mode B (Settings → Simple): Embed map, no billed map load; Navigate shows Embed directions', async ({ page }) => {
  await withLocation(page);
  await page.context().route(/^https:\/\/www\.google\.com\/maps\/dir\//, (r) => r.fulfill({ contentType: 'text/html', body: 'maps' }));
  await openApp(page, { map: { mode: 'embed' } });
  const embed = page.getByTestId('map-embed');
  await expect(embed).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\/embed\/v1\/view\?key=e2e-fake-key/);
  await expect(embed).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(await page.evaluate(() => window.__mapsStub?.maps ?? 0)).toBe(0);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Siam Paragon');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('map-dest-go').click();
  await (await popup).close();
  await expect(embed).toHaveAttribute('src', /\/maps\/embed\/v1\/directions\?.*destination=Siam\+Paragon/);
  expect(await page.evaluate(() => window.__mapsStub?.routes ?? 0)).toBe(0);
});

test('cost rule: at 9,920 map loads this month JorGu starts in mode B and says why', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(Date.now());
    const month = `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
    localStorage.setItem('jorgu:mapUsage', JSON.stringify({ state: { month, map: 9920, route: 0, refusedDay: null, refusedReason: null }, version: 1 }));
  });
  await page.reload();
  await expect(page.getByTestId('map-surface')).toHaveAttribute('data-mode', 'embed');
  await expect(page.getByTestId('map-notice')).toContainText('free limit');
  expect(await page.evaluate(() => window.__mapsStub?.maps ?? 0)).toBe(0);
});

test('Google refuses the key (gm_authFailure): falls back to mode B with a note', async ({ page }) => {
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  await page.evaluate(() => (window as unknown as { gm_authFailure: () => void }).gm_authFailure());
  await expect(page.getByTestId('map-surface')).toHaveAttribute('data-mode', 'embed');
  await expect(page.getByTestId('map-notice')).toContainText('refused');
});

test('map controls move away from the mini player; nothing covers it', async ({ page }) => {
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('pane-fullscreen-1').click();
  await expect(page.getByTestId('map-controls')).toHaveAttribute('data-side', 'left');
  await expectPlayerClear(page);
  const controls = await box(page, '[data-testid="map-controls"]');
  const mini = await box(page, '[data-player-rect]');
  expect(controls.x + controls.width).toBeLessThan(mini.x);
});
