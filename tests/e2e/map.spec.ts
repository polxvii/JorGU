// M4 Map app (spec §7). Google Maps is a stub (helpers.ts): these tests check what JorGu asks Google for, never real maps.
import { expect, test, type Page } from '@playwright/test';
import { box, expectPlayerClear, openApp, startSimulatedPlayback } from './helpers';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const HERE = { latitude: 13.7563, longitude: 100.5018 };
const stub = (page: Page) => page.evaluate(() => ({ ...window.__mapsStub!, listeners: undefined, fire: undefined }));
/** The blue route lines on the map (the route itself; its dark edge and slow / jam stretches are separate lines). */
const blue = (s: { shown: { strokeColor: string }[] }) => s.shown.filter((l) => l.strokeColor === '#1A73E8').length;

async function withLocation(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(HERE);
}

test('one map for the whole session: swaps, single/split and full screen never create another (one billed load)', async ({ page }) => {
  await openApp(page);
  await expect.poll(async () => (await stub(page)).maps).toBe(1);
  expect((await stub(page)).mapId).toBe('e2e-map-id');
  // Day colours by default (user 2026-11-13), whatever the app's night mode.
  expect((await stub(page)).colorScheme).toBe('LIGHT');
  await page.getByTestId('dock-swap').click();
  await page.getByTestId('dock-layout').click();
  await page.getByTestId('dock-layout').click();
  await page.getByTestId('pane-fullscreen-0').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-surface="map"]')).toHaveAttribute('data-visible', '1');
  expect((await stub(page)).maps).toBe(1);
  await page.getByTestId('dock-settings').click();
  // Monthly free use less 1 %, today's share = what's left ÷ days left (user 2026-11-13).
  await expect(page.getByTestId('setting-map-usage-map')).toContainText('9,899 left this month (1 / 9,900) · today 1 / ');
  await expect(page.getByTestId('setting-map-usage-route')).toContainText('9,900 left');
  await expect(page.getByTestId('setting-map-usage-traffic')).toContainText('4,950 left this month');
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
  expect(s).toMatchObject({ maps: 1, routes: 1, pins: 1, traffic: true, fitBounds: 0, zoom: 16 });
  expect(blue(s)).toBe(1);
  await expect(page.getByTestId('map-route-time')).toContainText('min');
  // Traffic-aware with choices: the Pro SKU (user 2026-11-13); one route here, so no chooser.
  expect(s.lastRoute).toMatchObject({ destination: 'Central World', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true, fields: ['durationMillis', 'distanceMeters', 'path', 'description'] });
  await expect(page.getByTestId('map-route-chooser')).toHaveCount(0);
  await expect(page.getByTestId('map-route-name')).toHaveText('via Phahonyothin Rd');
  expect(s.lastRoute).not.toHaveProperty('extraComputations'); // traffic on the line = Enterprise SKU
  // One solid blue line (user 2026-11-13); traffic on the road ahead is the side bar.
  expect(s.shown).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ strokeColor: '#1A73E8', strokeOpacity: 1, strokeWeight: 7, path: [{ lat: HERE.latitude, lng: HERE.longitude }, expect.anything()] }),
      // A dark edge, so the line stands out from the Traffic layer's colours on the same road.
      expect.objectContaining({ strokeColor: '#0B3B8C', strokeWeight: 11 }),
    ]),
  );
  // Traffic per section: one Compute Routes Pro request (traffic-aware, waypoints on our route with headings), never
  // "traffic on polylines" (Enterprise).
  await expect.poll(async () => (await stub(page)).trafficReqs).toBe(1);
  const tr = (await stub(page)).lastTraffic!;
  expect(tr).toMatchObject({ routingPreference: 'TRAFFIC_AWARE', travelMode: 'DRIVING', fields: ['legs'], origin: { heading: 44 } }); // the road's bearing (north-east at this latitude)
  expect(tr).not.toHaveProperty('extraComputations');
  expect((tr.intermediates as unknown[]).length).toBe(25);
  const barEl = page.getByTestId('map-traffic-bar');
  await expect(barEl).toBeVisible();
  await expect(barEl.locator('[data-level="jam"]')).toHaveCount(1);
  await expect(barEl.locator('[data-level="slow"]')).toHaveCount(1);
  // The same sections on the route line itself (user 2026-11-13): red where jammed, orange where slow, blue elsewhere.
  const painted = (await stub(page)).shown.filter((l) => l.strokeColor === '#D93025' || l.strokeColor === '#F29900');
  expect(painted.map((l) => l.strokeColor).sort()).toEqual(['#D93025', '#F29900']);
  for (const l of painted) expect(l.strokeWeight).toBe(7);
  // Beside the toolbar strip, clear of it and of the route box.
  const tb = await box(page, '[data-testid="map-traffic-bar"]');
  const st = await box(page, '[data-testid="map-strip"]');
  expect(tb.x + tb.width).toBeLessThanOrEqual(st.x);
  expect(st.x - (tb.x + tb.width)).toBeLessThan(20);
  const rbx = await box(page, '[data-testid="map-route"]');
  expect(tb.x + tb.width <= rbx.x || rbx.x + rbx.width <= tb.x || tb.y + tb.height <= rbx.y || rbx.y + rbx.height <= tb.y).toBe(true);
  // The time left counts the traffic: 7.4 km at 10 m/s = ~12 min free-flowing, plus the jam and the slow section.
  const mins = Number((await page.getByTestId('map-route-time').textContent())!.match(/\d+/)![0]);
  expect(mins).toBeGreaterThan(12);
  // Traffic off hides the bar (no request); on again within 5 minutes reuses what we have.
  await page.getByTestId('map-traffic').click();
  await expect(barEl).toHaveCount(0);
  expect((await stub(page)).shown.filter((l) => l.strokeColor === '#D93025' || l.strokeColor === '#F29900')).toHaveLength(0);
  await page.getByTestId('map-traffic').click();
  await expect(barEl).toBeVisible();
  expect((await stub(page)).trafficReqs).toBe(1);
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
  // Order (user 2026-11-13): traffic right after my location, Google Maps last.
  const order = await controls.locator('[data-testid^="map-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(order).toEqual(['map-navigate', 'map-recenter', 'map-traffic', 'map-zoom-in', 'map-zoom-out', 'map-route-overview', 'map-route-end', 'map-route-navigate']);
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
  // Bigger (user 2026-11-13) but still a corner box.
  expect(rb.height).toBeGreaterThanOrEqual(80);
  expect(rb.height).toBeLessThanOrEqual(90);
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
  expect(await stub(page)).toMatchObject({ routes: 2, pins: 1 });
  expect(blue(await stub(page))).toBe(1);
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
  expect(await stub(page)).toMatchObject({ routes: 1, pins: 1 });
  expect(blue(await stub(page))).toBe(1);
});

test("the line can't be drawn (Routes refused, or the daily route limit): the route shows in the free view with a note", async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.evaluate(() => (window.__mapsStub!.failRoutes = true));
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('data-src', /\/maps\/embed\/v1\/directions\?.*destination=Central\+World/);
  await expect(page.getByTestId('map-route-detail')).toContainText('simple map');
  await expect(page.getByTestId('map-route-navigate')).toBeVisible();
  // Route limit used up: no Routes call at all.
  await page.evaluate(() => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(Date.now());
    const month = `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
    // Both route shares used up: traffic-aware (Pro) and the plain route (Essentials).
    const used = { map: 0, route: 9900, traffic: 4950 };
    localStorage.setItem('jorgu:mapUsage', JSON.stringify({ state: { month, used, day: '', today: { map: 0, route: 0, traffic: 0 }, refusedDay: null, refusedReason: null }, version: 2 }));
  });
  await page.reload();
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Siam Paragon');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-embed')).toHaveAttribute('data-src', /destination=Siam\+Paragon/);
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
  await expect(page.getByTestId('map-embed')).toHaveAttribute('data-src', /\/maps\/embed\/v1\/directions\?.*destination=Central\+World.*&avoid=tolls/);
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
  expect(s.lastRoute).toMatchObject({ routingPreference: 'TRAFFIC_AWARE', routeModifiers: { avoidTolls: true, avoidHighways: false } });
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-avoid-highways').click();
  await expect.poll(async () => (await stub(page)).routes).toBe(2);
  s = await stub(page);
  expect(s.lastRoute).toMatchObject({ routeModifiers: { avoidTolls: true, avoidHighways: true } });
  expect(blue(s)).toBe(1);
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
  await expect(embed).toHaveAttribute('data-src', /^https:\/\/www\.google\.com\/maps\/embed\/v1\/view\?key=e2e-fake-key/);
  await expect(embed).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(await page.evaluate(() => window.__mapsStub?.maps ?? 0)).toBe(0);
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Siam Paragon');
  await page.getByTestId('map-dest-go').click();
  await expect(embed).toHaveAttribute('data-src', /\/maps\/embed\/v1\/directions\?.*destination=Siam\+Paragon/);
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
  // The YouTube pane above has its controls in rows under the video: a bigger video than beside a side strip
  // (430 - 72 = 358 px wide) (user 2026-11-13); ±10 s come as a pair.
  await expect(page.getByTestId('yt-transport')).toHaveAttribute('data-side', '0');
  expect((await box(page, '[data-player-rect]')).width).toBeGreaterThan(370);
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

test('saved places: change their order with up / down', async ({ page }) => {
  const place = (id: string, label: string) => ({ id, label, query: label, source: 'manual' });
  await openApp(page, { map: { savedPlaces: [place('p1', 'Home'), place('p2', 'Office'), place('p3', 'Gym')] } });
  await page.getByTestId('map-navigate').click();
  const order = () => page.getByTestId('map-places').locator(':scope > li').evaluateAll((els) => els.map((e) => (e.textContent ?? '').match(/Home|Office|Gym/)?.[0]));
  expect(await order()).toEqual(['Home', 'Office', 'Gym']);
  await page.getByTestId('map-places-reorder').click();
  await page.getByTestId('map-place-move-p3-up').click();
  await page.getByTestId('map-place-move-p3-up').click();
  expect(await order()).toEqual(['Gym', 'Home', 'Office']);
  await expect(page.getByTestId('map-place-move-p3-up')).toBeDisabled();
  await page.getByTestId('map-places-reorder').click();
  // Back to normal rows: remove is there again; the order stays after a reload.
  await expect(page.getByTestId('map-places').getByRole('button', { name: /remove/i }).first()).toBeVisible();
  await page.reload();
  await page.getByTestId('map-navigate').click();
  expect(await order()).toEqual(['Gym', 'Home', 'Office']);
});

test('route choices: up to 3 with time in traffic, fastest first; pick one to drive it', async ({ page }) => {
  await withLocation(page);
  await openApp(page);
  await expect.poll(async () => (await stub(page)).markers).toBe(1);
  await page.evaluate(() => (window.__mapsStub!.alts = true));
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  const chooser = page.getByTestId('map-route-chooser');
  await expect(chooser).toBeVisible();
  // Fastest first (Google's order isn't), with its time in traffic and the road it takes.
  await expect(page.getByTestId('map-route-option-0')).toContainText('20 min');
  await expect(page.getByTestId('map-route-option-0')).toContainText('Fastest');
  await expect(page.getByTestId('map-route-option-0')).toContainText('via Phahonyothin Rd');
  await expect(page.getByTestId('map-route-option-1')).toContainText('25 min');
  await expect(page.getByTestId('map-route-option-2')).toContainText('28 min');
  await expect(page.getByTestId('map-route-option-0')).toHaveAttribute('aria-pressed', 'true');
  // All of them on screen, north up, the others grey; one Routes request; no traffic request while choosing.
  let s = await stub(page);
  expect(s).toMatchObject({ routes: 1, trafficReqs: 0, heading: 0 });
  expect(s.fitBounds).toBeGreaterThan(0);
  expect(s.shown.filter((l) => l.strokeColor === '#8A94A6')).toHaveLength(2);
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'false');
  // The chooser sits beside the route box, never over it or the toolbar.
  const cb = await box(page, '[data-testid="map-route-chooser"]');
  const rb = await box(page, '[data-testid="map-route"]');
  const st = await box(page, '[data-testid="map-strip"]');
  expect(cb.y + cb.height <= rb.y || rb.y + rb.height <= cb.y).toBe(true);
  expect(cb.x + cb.width).toBeLessThanOrEqual(st.x);
  // Pick the expressway: it's drawn, the others go, the car is followed, its traffic is fetched.
  await page.getByTestId('map-route-option-1').click();
  await expect(chooser).toHaveCount(0);
  // (The time then follows that route's own traffic sections.)
  await expect(page.getByTestId('map-route-name')).toHaveText('via Expressway');
  s = await stub(page);
  expect(s.shown.filter((l) => l.strokeColor === '#8A94A6')).toHaveLength(0);
  expect(s.shown.find((l) => l.strokeColor === '#1A73E8')!.path).toHaveLength(3);
  await expect(page.getByTestId('map-recenter')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await stub(page)).trafficReqs).toBe(1);
  // "Other routes" in the toolbar opens the choices again; ✕ keeps the one being driven.
  await page.getByTestId('map-route-alts').click();
  await expect(page.getByTestId('map-route-option-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('map-route-chooser-close').click();
  await expect(chooser).toHaveCount(0);
  await expect(page.getByTestId('map-route-name')).toHaveText('via Expressway');
  expect((await stub(page)).trafficReqs).toBe(1);
});

test('speed (km/h) beside the route box, in its corner without a route (user 2026-11-13)', async ({ page }) => {
  // Browsers under test give no speed: add 12.5 m/s (45 km/h) to every fix.
  await page.addInitScript(() => {
    const g = navigator.geolocation;
    const watch = g.watchPosition.bind(g);
    g.watchPosition = (ok, err, o) =>
      watch(
        (p) =>
          ok({
            timestamp: p.timestamp,
            coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: 12.5 },
          } as GeolocationPosition),
        err,
        o,
      );
  });
  await withLocation(page);
  await openApp(page);
  const speed = page.getByTestId('map-speed');
  await expect(speed).toContainText('45');
  await expect(speed).toContainText('km/h');
  // No route: in the route box's corner (bottom, far from the toolbar strip).
  const surf = await box(page, '[data-testid="map-surface"]');
  let sp = await box(page, '[data-testid="map-speed"]');
  const strip = await box(page, '[data-testid="map-strip"]');
  expect(sp.x).toBeLessThan(surf.x + 20);
  expect(sp.y + sp.height).toBeGreaterThan(surf.y + surf.height - 20);
  expect(sp.x + sp.width).toBeLessThan(strip.x);
  // With a route: right beside the route box, same height, not in the toolbar.
  await page.getByTestId('map-navigate').click();
  await page.getByTestId('map-dest-input').fill('Central World');
  await page.getByTestId('map-dest-go').click();
  await expect(page.getByTestId('map-route')).toHaveAttribute('data-status', 'ready');
  const rb = await box(page, '[data-testid="map-route"]');
  sp = await box(page, '[data-testid="map-speed"]');
  expect(sp.x).toBeGreaterThanOrEqual(rb.x + rb.width);
  expect(sp.x - (rb.x + rb.width)).toBeLessThanOrEqual(10);
  expect(Math.round(sp.y)).toBe(Math.round(rb.y));
  expect(Math.round(sp.height)).toBe(Math.round(rb.height));
  await expect(page.getByTestId('map-controls').getByTestId('map-speed')).toHaveCount(0);
});

