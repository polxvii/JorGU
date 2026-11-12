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
  // Traffic on: a chain of solid arrows, the road's traffic colour showing between them (user 2026-11-12).
  expect(s.lineStyle).toMatchObject({ strokeOpacity: 0, icons: [{ repeat: '30px', icon: { fillOpacity: 1, fillColor: '#1A73E8' } }] });
  // Traffic off: nothing to see under the line, so it turns solid; on again: arrows.
  await page.getByTestId('map-traffic').click();
  expect((await stub(page)).lineStyle).toMatchObject({ strokeOpacity: 1, strokeWeight: 7, icons: [] });
  await page.getByTestId('map-traffic').click();
  expect((await stub(page)).lineStyle).toMatchObject({ strokeOpacity: 0, icons: [{ repeat: '30px' }] });
  expect(popups).toBe(0);
  // Follows the car at driving zoom, the map turned so the road ahead points up (the stub route heads north-east)
  // and the car about 25 % up from the bottom: the camera centre is ahead of the car.
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.round((await stub(page)).heading)).toBe(44);
  const cam = (await stub(page)).center!;
  expect(cam.lat).toBeGreaterThan(HERE.latitude);
  expect(cam.lng).toBeGreaterThan(HERE.longitude);
  // The toolbar is a strip flush to the driver-side edge; the map sits beside it, not under it (user 2026-11-12).
  const surf = await box(page, '[data-testid="map-surface"]');
  const strip = await box(page, '[data-testid="map-strip"]');
  const canvasBox = await box(page, '[data-testid="map-canvas"]');
  expect(Math.round(strip.x + strip.width)).toBe(Math.round(surf.x + surf.width));
  expect(Math.round(canvasBox.x + canvasBox.width)).toBe(Math.round(strip.x));
  // Route buttons are in the map's toolbar (user 2026-11-12), not on the route box.
  const controls = page.getByTestId('map-controls');
  for (const id of ['map-route-overview', 'map-route-navigate', 'map-route-end']) await expect(controls.getByTestId(id)).toBeVisible();
  // Whole route: north up, fitted; ⌖ turns back to the road ahead.
  await page.getByTestId('map-route-overview').click();
  expect(await stub(page)).toMatchObject({ fitBounds: 1, heading: 0 });
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('map-recenter').click();
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.round((await stub(page)).heading)).toBe(44);
  // Route box: time, distance, arrival only; bottom corner by default, beside the toolbar; a tap moves it to the top.
  const routeBox = page.getByTestId('map-route');
  await expect(routeBox).toHaveAttribute('data-at', 'bottom');
  await expect(routeBox.locator('button, a')).toHaveCount(0);
  const cb = await box(page, '[data-testid="map-controls"]');
  let rb = await box(page, '[data-testid="map-route"]');
  expect(rb.x + rb.width <= cb.x || cb.x + cb.width <= rb.x).toBe(true);
  expect(rb.height).toBeLessThanOrEqual(64);
  const surface = await box(page, '[data-testid="map-surface"]');
  expect(rb.y + rb.height).toBeGreaterThan(surface.y + surface.height - 80);
  await routeBox.click();
  await expect(routeBox).toHaveAttribute('data-at', 'top');
  rb = await box(page, '[data-testid="map-route"]');
  expect(rb.y).toBeLessThan(surface.y + 80);
  await routeBox.click();
  await expect(routeBox).toHaveAttribute('data-at', 'bottom');
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
  expect(await stub(page)).toMatchObject({ lines: 0, pins: 0, routes: 1, maps: 1, heading: 0 });
  await expect(page.getByTestId('map-route-end')).toHaveCount(0);
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

for (const vp of [{ width: 1024, height: 600 }, { width: 430, height: 860 }]) {
  test(`map full screen ${vp.width}x${vp.height}: the floating bar never covers the map's buttons or the route box`, async ({ page }) => {
    await withLocation(page);
    await page.setViewportSize(vp);
    await openApp(page);
    await expect.poll(async () => (await stub(page)).markers).toBe(1);
    await page.getByTestId('map-navigate').click();
    await page.getByTestId('map-dest-input').fill('Central World');
    await page.getByTestId('map-dest-go').click();
    await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
    const before = (await stub(page)).center;
    const paneH = (await box(page, '[data-surface="map"]')).height;
    await page.getByTestId('pane-fullscreen-1').click();
    const s = await box(page, '[data-surface="map"]');
    // A taller map puts the camera further ahead, so the car stays 25 % below the middle.
    if (s.height !== paneH) await expect.poll(async () => JSON.stringify((await stub(page)).center)).not.toBe(JSON.stringify(before));
    await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
    await expect(page.getByTestId('floating-bar')).toBeVisible();
    const bar = await box(page, '[data-testid="floating-bar"]');
    const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    expect(apart(await box(page, '[data-testid="map-controls"]'), bar)).toBe(true);
    for (const routeAt of ['bottom', 'top']) {
      await expect(page.getByTestId('map-route')).toHaveAttribute('data-at', routeAt);
      expect(apart(await box(page, '[data-testid="map-route"]'), bar)).toBe(true);
      if (routeAt === 'bottom') {
        await page.getByTestId('map-route').click();
        await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
        await expect(page.getByTestId('floating-bar')).toBeVisible();
      }
    }
  });
}

test('short map pane (upright phone): buttons that do not fit are under More', async ({ page }) => {
  await withLocation(page);
  await page.setViewportSize({ width: 430, height: 860 });
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('map-more')).toBeVisible();
  await expect(page.getByTestId('map-route-end')).toHaveCount(0);
  // The YouTube pane above has its controls in a side strip too; ±10 s come as a pair.
  await expect(page.getByTestId('yt-transport')).toHaveAttribute('data-side', '1');
  expect(await page.getByTestId('yt-back10').count()).toBe(await page.getByTestId('yt-forward10').count());
  await page.getByTestId('map-more').click();
  await expect(page.getByTestId('map-more-menu')).toBeVisible();
  await page.getByTestId('map-more-menu').getByTestId('map-route-end').click();
  await expect(page.getByTestId('map-route')).toHaveCount(0);
  await expect(page.getByTestId('map-more-menu')).toHaveCount(0);
});

test('a hidden Map surface hides the map itself too (no line of map around YouTube full screen)', async ({ page }) => {
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await page.getByTestId('pane-fullscreen-0').click();
  await expect(page.locator('[data-surface="map"]')).toHaveAttribute('data-visible', '0');
  expect(await page.getByTestId('map-canvas').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
});

test('map controls move away from the mini player; nothing covers it', async ({ page }) => {
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('pane-fullscreen-1').click();
  await expectPlayerClear(page);
  // Clear of the mini player and of the floating bar (which sits on the side away from the mini player): here the
  // toolbar stays on the driver side, wrapped into columns above the mini player.
  const controls = await box(page, '[data-testid="map-controls"]');
  const mini = await box(page, '[data-player-rect]');
  expect(controls.y + controls.height <= mini.y || controls.x + controls.width <= mini.x).toBe(true);
  const s = await box(page, '[data-surface="map"]');
  await page.mouse.click(s.x + s.width / 3, s.y + s.height / 2);
  await expect(page.getByTestId('floating-bar')).toBeVisible();
  const bar = await box(page, '[data-testid="floating-bar"]');
  expect(controls.x >= bar.x + bar.width || bar.x >= controls.x + controls.width || controls.y >= bar.y + bar.height || bar.y >= controls.y + controls.height).toBe(true);
  await expectPlayerClear(page);
});
