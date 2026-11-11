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

test('Show route: drawn on the live map with the moving dot and traffic; JorGu never jumps to Google Maps', async ({ page }) => {
  await withLocation(page);
  // The card's Navigate link opens a new tab; answer it locally.
  await page.context().route(/^https:\/\/www\.google\.com\/maps\/dir\//, (r) => r.fulfill({ contentType: 'text/html', body: 'maps' }));
  let popups = 0;
  page.on('popup', () => popups++);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-sheet')).toHaveCount(0);
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('map-route-detail')).toContainText('km');
  // One map: the route line, the destination pin, the car dot and traffic together. No Embed view on top.
  await expect(page.getByTestId('map-embed')).toHaveCount(0);
  const s = await stub(page);
  expect(s).toMatchObject({ maps: 1, routes: 1, lines: 1, pins: 1, traffic: true, fitBounds: 0, zoom: 16 });
  await expect(page.getByTestId('map-route-time')).toContainText('min');
  expect(s.lastRoute).toMatchObject({ destination: 'Central World', routingPreference: 'TRAFFIC_UNAWARE', fields: ['durationMillis', 'distanceMeters', 'path'] });
  expect(s.lastRoute).not.toHaveProperty('extraComputations'); // traffic on the line = Enterprise SKU
  // See-through line over the Traffic layer, Google's own colour kept.
  expect(s.lineStyle).toEqual({ strokeColor: '#4285F4', strokeOpacity: 0.5 });
  expect(popups).toBe(0);
  // Follows the car at driving zoom. The bar shows the whole route on request; ⌖ follows again.
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('map-route-overview').click();
  expect((await stub(page)).fitBounds).toBe(1);
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('map-recenter').click();
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  // The slim bar sits beside the control column, not over it.
  const bar = await box(page, '[data-testid="map-route"]');
  const controls = await box(page, '[data-testid="map-controls"]');
  expect(bar.x + bar.width <= controls.x || controls.x + controls.width <= bar.x).toBe(true);
  expect(bar.height).toBeLessThanOrEqual(64);
  // The Where to? sheet has the same hand-off, with its full label.
  await page.getByTestId('map-navigate').click();
  expect(new URL((await page.getByTestId('map-sheet-navigate').getAttribute('href'))!).searchParams.get('destination')).toBe('Central World');
  await page.getByTestId('sheet-close').click();
  await expect(page.getByTestId('map-sheet')).toHaveCount(0);
  // Voice guidance: only the card's Navigate button hands the trip to Google Maps.
  const nav = page.getByTestId('map-route-navigate');
  const href = new URL((await nav.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://www.google.com/maps/dir/');
  expect(href.searchParams.get('destination')).toBe('Central World');
  expect(href.searchParams.get('dir_action')).toBe('navigate');
  await expect(nav).toHaveAttribute('target', '_blank');
  await expect(nav).toHaveAttribute('rel', 'noopener');
  const popup = page.waitForEvent('popup');
  await nav.click();
  await (await popup).close();
  expect(popups).toBe(1);
  await page.getByTestId('map-route-end').click();
  await expect(page.getByTestId('map-route')).toHaveCount(0);
  expect(await stub(page)).toMatchObject({ lines: 0, pins: 0, routes: 1, maps: 1 });
  // Remembered as a recent destination; tapping it shows the route again.
  await page.getByTestId('map-navigate').click();
  await expect(page.getByTestId('map-recent')).toContainText('Central World');
  await page.getByTestId('map-recent-0').click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  expect(await stub(page)).toMatchObject({ routes: 2, lines: 1, pins: 1 });
  expect(popups).toBe(1);
});

test('Show route before a location fix: waits, then draws once the first position arrives', async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  // No fix yet in some runs; either way it ends up drawn after a position is set.
  await page.context().setGeolocation(HERE);
  await page.getByTestId('map-recenter').click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  expect(await stub(page)).toMatchObject({ routes: 1, lines: 1, pins: 1 });
});

test("the line can't be drawn (Routes refused, or the daily route limit): the route shows in the free view with a note", async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.evaluate(() => (window.__mapsStub!.failRoutes = true));
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('src', /\/maps\/embed\/v1\/directions\?.*destination=Central\+World/);
  await expect(page.getByTestId('map-route-detail')).toContainText('simple map');
  await expect(page.getByTestId('map-route-navigate')).toBeVisible();
  // Route limit used up: no Routes call at all.
  await page.evaluate(() => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(Date.now());
    const month = `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
    localStorage.setItem('jorgu:mapUsage', JSON.stringify({ state: { month, map: 0, route: 9920, refusedDay: null, refusedReason: null }, version: 1 }));
  });
  await page.reload();
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Siam Paragon');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('src', /destination=Siam\+Paragon/);
  await expect(page.getByTestId('map-route-detail')).toContainText('Route limit reached');
  expect((await stub(page)).routes).toBe(0);
});

test('Settings → route on the simple map: the route shows in the free Embed view, no Routes call', async ({ page }) => {
  await withLocation(page);
  await openApp(page, { map: { routeLine: false, avoidTolls: true } });
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('src', /\/maps\/embed\/v1\/directions\?.*destination=Central\+World.*&avoid=tolls/);
  expect(await stub(page)).toMatchObject({ routes: 0, maps: 1 });
  await page.getByTestId('map-route-end').click();
  await expect(page.getByTestId('map-embed')).toHaveCount(0);
});

test('avoid tolls / highways: sent with the route, drawn again when changed, remembered', async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-avoid-tolls').click();
  await expect(page.getByTestId('map-avoid-tolls')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-sheet')).toContainText('Google Maps app');
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  let s = await stub(page);
  expect(s.routes).toBe(1);
  // Plain route modifiers: still the Essentials route SKU.
  expect(s.lastRoute).toMatchObject({ routingPreference: 'TRAFFIC_UNAWARE', routeModifiers: { avoidTolls: true, avoidHighways: false } });
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-avoid-highways').click();
  await expect.poll(async () => (await stub(page)).routes).toBe(2);
  s = await stub(page);
  expect(s.lastRoute).toMatchObject({ routeModifiers: { avoidTolls: true, avoidHighways: true } });
  expect(s.lines).toBe(1);
  await page.reload();
  await page.getByTestId('map-navigate').click();
  await expect(page.getByTestId('map-avoid-tolls')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-avoid-highways')).toHaveAttribute('aria-pressed', 'true');
});

test('saved places: add one, show the route to it', async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-add-place').click();
  await page.getByTestId('map-place-label').fill('Home');
  await page.getByTestId('map-place-query').fill('Sukhumvit 24');
  await page.getByTestId('map-place-save').click();
  const place = page.getByTestId('map-places').getByRole('button', { name: /Home/ });
  await expect(place).toContainText('Sukhumvit 24');
  await place.click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  expect((await stub(page)).lastRoute).toMatchObject({ destination: 'Sukhumvit 24' });
});

test('mode B (Settings → Simple): Embed map, no billed map load; Show route uses Embed directions', async ({ page }) => {
  await withLocation(page);
  let popups = 0;
  page.on('popup', () => popups++);
  await openApp(page, { map: { mode: 'embed' } });
  const embed = page.getByTestId('map-embed');
  await expect(embed).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\/embed\/v1\/view\?key=e2e-fake-key/);
  await expect(embed).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(await page.evaluate(() => window.__mapsStub?.maps ?? 0)).toBe(0);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Siam Paragon');
  await page.getByTestId('map-dest-go').click();
  await expect(embed).toHaveAttribute('src', /\/maps\/embed\/v1\/directions\?.*destination=Siam\+Paragon/);
  expect(await page.evaluate(() => window.__mapsStub?.routes ?? 0)).toBe(0);
  expect(popups).toBe(0);
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
