// M2b client flows with /api mocked (the real Worker is covered by tests/worker). Spec §8.1–8.4, §8.8.
import { expect, test, type Page, type Route } from '@playwright/test';
import { expectPlayerClear, openApp, startSimulatedPlayback } from './helpers';

// page.route can't see requests that go through a service worker, so mocking needs the SW blocked.
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const VIDEO_A = 'M7lc1UVf-VE';
const VIDEO_B = 'aqz-KE-bpKQ';
const v = (videoId: string, title: string, channel = 'Mock Channel', duration?: number) => ({ videoId, title, channel, thumb: '', duration });

// Feed video one is 3 days old (the lists show each clip's age, user 2026-11-13).
const FEED = [{ ...v(VIDEO_A, 'Feed video one', 'Mock Channel', 245), publishedAt: new Date(Date.now() - 3 * 86_400_000 - 60_000).toISOString() }, v(VIDEO_B, 'Feed video two')];
const PLAYLISTS = [
  { id: 'PLroadtrip0001', title: 'Road trip', count: 3, thumb: '' },
  { id: 'PLnews0000002', title: 'News', count: 1, thumb: '' },
];
const ROAD = [v(VIDEO_A, 'Road Song One'), v(VIDEO_B, 'Road Song Two'), v('dQw4w9WgXcQ', 'เพลงรักฤดูร้อน', 'วงไทย')];
const NEWS = [v('9bZkp7q19f0', 'Morning news')];
const LIKED = [v('kJQP7kiw5Fk', 'Liked thing')];
const SEARCH = [v('OPf0YbXqDm0', 'From YouTube search')];
// Channels for New (user 2026-11-15).
const UCA = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const UCB = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const UCC = 'UCcccccccccccccccccccccc';
const SUBS = [
  { channelId: UCB, title: 'Vlogger B', thumb: '' },
  { channelId: UCA, title: 'Band A', thumb: '' },
  { channelId: UCC, title: 'News C', thumb: '' },
];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const clip = (videoId: string, title: string, channel: string, channelId: string, h: number) => ({ ...v(videoId, title, channel, 300), channelId, publishedAt: hoursAgo(h) });
const FEED_CHANNELS = [
  clip('M7lc1UVf-VE', 'Song A1', 'Band A', UCA, 1),
  clip('aqz-KE-bpKQ', 'Song A2', 'Band A', UCA, 2),
  clip('dQw4w9WgXcQ', 'Vlog B1', 'Vlogger B', UCB, 3),
  clip('kJQP7kiw5Fk', 'Vlog B2', 'Vlogger B', UCB, 4),
  clip('9bZkp7q19f0', 'News C1', 'News C', UCC, 5),
];
const SEARCH_WITH_SHORT = [v('OPf0YbXqDm0', 'From YouTube search', 'Mock Channel', 225), v('kffacxfA7G4', 'A Short in search', 'Mock Channel', 50)];

interface Mock {
  connected: boolean;
  reauth: boolean;
  calls: string[];
  /** Replaces FEED for one test. */
  feed?: unknown[];
}

async function mockApi(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = { connected: true, reauth: false, calls: [], ...init };
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    m.calls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const json = (body: unknown, status = 200, units = 0) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: units ? { 'X-Quota-Units': String(units) } : {} });
    if (url.pathname.startsWith('/api/yt/') && (m.reauth || !m.connected)) {
      if (m.reauth) m.connected = false;
      return json({ code: m.reauth ? 'REAUTH' : 'NOT_CONNECTED' }, 401);
    }
    switch (url.pathname) {
      case '/api/auth/me':
        return json(m.connected ? { connected: true, email: 'driver@example.com', name: 'Driver', picture: '' } : { connected: false });
      case '/api/auth/login':
        m.connected = true;
        m.reauth = false;
        return route.fulfill({ status: 302, headers: { Location: '/?yt=connected' } });
      case '/api/auth/logout':
        m.connected = false;
        return json({ ok: true });
      case '/api/yt/feed':
        return json({ items: m.feed ?? FEED, muted: [] }, 200, 42);
      case '/api/yt/subscriptions':
        return json({ items: SUBS }, 200, 1);
      case '/api/yt/playlists':
        return json({ items: PLAYLISTS }, 200, 1);
      case '/api/yt/playlist-items':
        return json({ items: url.searchParams.get('id') === 'PLroadtrip0001' ? ROAD : NEWS }, 200, 1);
      case '/api/yt/liked':
        return json({ items: LIKED }, 200, 1);
      case '/api/yt/popular': {
        const cat = url.searchParams.get('category');
        if (cat === '29') return json({ items: [] }, 200, 1);
        if (cat === '1') return json({ items: [v(VIDEO_B, 'Movie trailer', 'Studio', 95), v(VIDEO_A, 'Full scene', 'Studio', 250)] }, 200, 1);
        return json({ items: [v(VIDEO_B, cat === '10' ? 'Top music' : cat ? `Top ${cat}` : 'Top trending')] }, 200, 1);
      }
      case '/api/yt/categories':
        return json({ items: [{ id: '24', title: 'Entertainment' }, { id: '10', title: 'Music' }, { id: '29', title: 'Nonprofits' }, { id: '1', title: 'Film' }] }, 200, 1);
      case '/api/yt/search':
        return json({ items: url.searchParams.get('q') === 'shorts test' ? SEARCH_WITH_SHORT : SEARCH }, 200, 101);
      case '/api/yt/videos':
        return json({ items: (url.searchParams.get('ids') ?? '').split(',').map((id) => v(id, `Title of ${id}`, 'Fetched channel')) }, 200, 1);
      default:
        return json({ code: 'NOT_FOUND' }, 404);
    }
  });
  return m;
}

const queue = (page: Page) => page.evaluate(() => window.__jorgu!.queue());
const countCalls = (m: Mock, prefix: string) => m.calls.filter((c) => c.startsWith(prefix)).length;

async function idbKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('jorgu-cache');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('api')) return resolve([]);
          const keys = db.transaction('api').objectStore('api').getAllKeys();
          keys.onsuccess = () => {
            resolve(keys.result.map(String));
            db.close();
          };
        };
        req.onerror = () => resolve([]);
      }),
  );
}

/** Everything page scripts can read: localStorage, sessionStorage, IndexedDB values, document.cookie. */
async function readableStorage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [document.cookie, JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const { name } of dbs) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((r) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => r(req.result);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((r) => {
          const req = db.transaction(store).objectStore(store).getAll();
          req.onsuccess = () => r(req.result);
        });
        parts.push(JSON.stringify(all));
      }
      db.close();
    }
    return parts.join('\n');
  });
}

test('disconnected: Link tab first; account tabs show Connect with the privacy policy; Connect records consent and returns connected', async ({ page }) => {
  const m = await mockApi(page, { connected: false });
  await openApp(page);
  await page.getByTestId('yt-empty-paste').click();
  await expect(page.getByTestId('lib-tab-paste')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('paste-input')).toBeVisible();

  await page.getByTestId('lib-tab-feed').click();
  await expect(page.getByTestId('connect-card')).toBeVisible();
  await expect(page.getByTestId('connect-card').getByTestId('privacy-link')).toHaveAttribute('href', '/privacy');
  await expect(page.getByTestId('open-youtube')).toHaveAttribute('href', 'https://www.youtube.com/');
  await expect(page.getByTestId('open-youtube')).toHaveAttribute('rel', 'noopener');
  expect(countCalls(m, 'GET /api/yt/')).toBe(0);

  await page.getByTestId('account-connect').click();
  await page.waitForURL((u) => u.pathname === '/' && !u.search.includes('yt='), { waitUntil: 'commit' });
  await expect(page.getByTestId('toast')).toContainText('YouTube connected');
  await expect(page.getByTestId('lib-feed')).toContainText('Feed video one');
  const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('jorgu:account') ?? '{}').state?.consentAt);
  expect(typeof consent).toBe('number');
});

test('connected: New, Playlists → Play all; no Liked tab; + adds to queue; lists are cached; nothing token-like is readable', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  const feed = page.getByTestId('lib-feed');
  await expect(feed).toContainText('Feed video one');

  await feed.getByTestId('lib-add').first().click();
  await expect.poll(async () => (await queue(page)).items.map((i) => i.videoId)).toEqual([VIDEO_A]);
  await expect(page.getByTestId('toast')).toContainText('Added to queue');

  await page.getByTestId('lib-tab-playlists').click();
  await page.locator('[data-playlist-id="PLroadtrip0001"]').click();
  await expect(page.getByTestId('lib-playlist-items')).toContainText('Road Song Two');
  await page.getByTestId('lib-play-all').click();
  await expect(page.getByTestId('library-sheet')).toHaveCount(0);
  const q = await queue(page);
  expect(q.items.map((i) => i.videoId)).toEqual(ROAD.map((x) => x.videoId));
  expect(q.items[1].title).toBe('Road Song Two');
  expect(q.index).toBe(0);

  await page.getByTestId('yt-library').click();
  await expect(page.getByTestId('lib-tab-liked')).toHaveCount(0);

  // Second visit within the TTL comes from IndexedDB, not the network. (Feed video one may be hidden by now: Play
  // all played it, and New leaves out clips played here.)
  const feedCalls = countCalls(m, 'GET /api/yt/feed');
  await page.getByTestId('lib-tab-feed').click();
  await expect(feed).toContainText('Feed video two');
  expect(countCalls(m, 'GET /api/yt/feed')).toBe(feedCalls);
  expect(await idbKeys(page)).toEqual(expect.arrayContaining(['feed', 'playlists', 'pl:PLroadtrip0001']));

  const readable = await readableStorage(page);
  for (const needle of ['ya29.', '1//', 'access_token', 'refresh_token', 'id_token', 'jg_session']) expect(readable).not.toContain(needle);
});

test('library-first search: "play X" from a playlist spends no search quota; "Search YouTube" does and the counter drops', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-search').click();
  await page.getByTestId('search-input').fill('play road song two');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-library-results')).toContainText('Road Song Two');
  // Thai, no spaces, voice-style prefix.
  await page.getByTestId('search-input').fill('เปิดเพลงรักฤดูร้อน');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-library-results')).toContainText('เพลงรักฤดูร้อน');
  await page.getByTestId('search-input').fill('liked thing');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-library-results')).toContainText('Liked videos');
  expect(countCalls(m, 'GET /api/yt/search')).toBe(0);

  const left = page.getByTestId('search-left');
  const before = Number((await left.textContent())!.match(/\d+/)![0]);
  await page.getByTestId('search-youtube').click();
  await expect(page.getByTestId('search-youtube-results')).toContainText('From YouTube search');
  expect(countCalls(m, 'GET /api/yt/search')).toBe(1);
  await expect.poll(async () => Number((await left.textContent())!.match(/\d+/)![0])).toBe(before - 1);

  await page.getByTestId('search-youtube-results').locator('li button').first().click();
  await expect.poll(async () => (await queue(page)).items.map((i) => i.videoId)).toEqual(['OPf0YbXqDm0']);
});

test('REAUTH: banner with Reconnect; cached list keeps working; banner survives reload; dismiss hides it', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  await expect(page.getByTestId('lib-feed')).toContainText('Feed video one');

  m.reauth = true;
  await page.getByTestId('lib-refresh').click();
  await expect(page.getByTestId('banner-reauth')).toBeVisible();
  await expect(page.getByTestId('lib-feed')).toContainText('Feed video one');
  await expect(page.getByTestId('lib-status')).toContainText('saved copy');
  await expect(page.getByTestId('connect-card')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('banner-reauth')).toBeVisible();
  await page.getByTestId('banner-reauth').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByTestId('banner-reauth')).toHaveCount(0);
});

test('REAUTH → Reconnect signs in again and clears the banner', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  m.reauth = true;
  await page.getByTestId('lib-refresh').click();
  await page.getByTestId('banner-reconnect').click();
  await page.waitForURL((u) => u.pathname === '/' && !u.search.includes('yt='), { waitUntil: 'commit' });
  await expect(page.getByTestId('toast')).toContainText('YouTube connected');
  await expect(page.getByTestId('banner-reauth')).toHaveCount(0);
  await expect(page.getByTestId('lib-feed')).toContainText('Feed video one');
});

test('disconnect: POST logout, cached data deleted, Settings shows Connect again', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  await expect(page.getByTestId('lib-feed')).toContainText('Feed video one');
  expect((await idbKeys(page)).length).toBeGreaterThan(0);

  await page.getByTestId('sheet-close').click();
  await page.getByTestId('dock-settings').click();
  const section = page.getByTestId('account-section');
  await expect(section).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('account-email')).toHaveText('driver@example.com');
  await page.getByTestId('account-disconnect').click();
  await expect(page.getByTestId('account-disconnect')).toContainText('Tap again');
  await page.getByTestId('account-disconnect').click();
  await expect(section).toHaveAttribute('data-status', 'disconnected');
  await expect(page.getByTestId('toast')).toContainText('YouTube disconnected');
  expect(countCalls(m, 'POST /api/auth/logout')).toBe(1);
  expect(await idbKeys(page)).toEqual([]);
  await expect(section.getByTestId('account-connect')).toBeVisible();
});

test('Trending: category chips from YouTube (Music first); a category without a chart says so', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-trending').click();
  await expect(page.getByTestId('lib-tab-music')).toHaveCount(0);
  const chips = page.getByTestId('chart-categories').getByRole('radio');
  await expect(chips).toHaveText(['All', 'Music', 'Entertainment', 'Nonprofits', 'Film']);
  await expect(page.getByTestId('lib-trending')).toContainText('Top trending');
  await chips.nth(1).click();
  await expect(page.getByTestId('lib-trending')).toContainText('Top music');
  expect(m.calls).toContain('GET /api/yt/popular?category=10');
  await page.getByTestId('chart-categories').locator('[data-value="29"]').click();
  await expect(page.getByTestId('library-sheet')).toContainText('No chart for this category');
  // Tap = play now.
  await page.getByTestId('chart-categories').locator('[data-value="10"]').click();
  await page.getByTestId('lib-trending').locator('li button').first().click();
  await expect.poll(async () => (await queue(page)).items.map((i) => i.title)).toEqual(['Top music']);
});

test('a pasted link gets its title from the account (videos.list)', async ({ page }) => {
  await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-paste').click();
  await page.getByTestId('paste-input').fill(`https://youtu.be/${VIDEO_B}`);
  await page.getByTestId('paste-queue').click();
  await expect.poll(async () => (await queue(page)).items[0]?.title).toBe(`Title of ${VIDEO_B}`);
});

test('OAuth return: denied and error show a toast and clean the URL', async ({ page }) => {
  await mockApi(page, { connected: false });
  await openApp(page);
  await page.goto('/?yt=denied');
  await expect(page.getByTestId('toast')).toContainText('cancelled');
  expect(new URL(page.url()).search).toBe('');
  await page.goto('/?yt=error&reason=state');
  await expect(page.getByTestId('toast')).toContainText('(state)');
  expect(new URL(page.url()).search).toBe('');
});

test('privacy policy page is served and links the required pages', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('h1').first()).toHaveText('JorGu Privacy Policy');
  for (const href of [
    'https://policies.google.com/privacy',
    'https://www.youtube.com/t/terms',
    'https://security.google.com/settings/security/permissions',
    'https://github.com/polxvii/JorGU/issues',
  ]) {
    await expect(page.locator(`#en a[href="${href}"]`)).toHaveCount(1);
    await expect(page.locator(`#th a[href="${href}"]`)).toHaveCount(1);
  }
});

for (const size of [
  { width: 1024, height: 600 },
  { width: 932, height: 430 },
]) {
  test(`library sheet never covers a playing player (${size.width}×${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockApi(page);
    await openApp(page);
    await startSimulatedPlayback(page);
    await page.getByTestId('yt-library').click();
    await expect(page.getByTestId('library-sheet')).toBeVisible();
    for (const tab of ['paste', 'feed', 'playlists', 'search']) {
      await page.getByTestId(`lib-tab-${tab}`).click();
      await expectPlayerClear(page);
    }
  });
}

test('short clips: New and Trending hide clips up to 2 min (Settings: 1 / 2 / 3 min); Search keeps them, with lengths', async ({ page }) => {
  const m = await mockApi(page);
  await openApp(page);
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-trending').click();
  await page.getByTestId('chart-categories').locator('[data-value="1"]').click();
  const chart = page.getByTestId('lib-trending');
  // 1:35 is hidden by default (Shorts can be 3 min; the worker's guess only catches <= 60 s or #shorts).
  await expect(chart).toContainText('Full scene');
  await expect(chart).toContainText('4:10');
  await expect(chart).not.toContainText('Movie trailer');
  await page.getByTestId('sheet-close').click();

  await page.getByTestId('dock-settings').click();
  const setting = page.getByTestId('setting-hide-up-to');
  await expect(setting.getByRole('radio')).toHaveText(['1 min', '2 min', '3 min']);
  await expect(setting.locator('[data-value="120"]')).toHaveAttribute('aria-checked', 'true');
  await setting.locator('[data-value="60"]').click();
  await page.getByTestId('sheet-close').click();
  // Applies to the cached list at once: no new request.
  const calls = countCalls(m, 'GET /api/yt/popular?category=1');
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-trending').click();
  await expect(chart).toContainText('Movie trailer');
  expect(countCalls(m, 'GET /api/yt/popular?category=1')).toBe(calls);
  await page.reload();
  await page.getByTestId('dock-settings').click();
  await expect(page.getByTestId('setting-hide-up-to').locator('[data-value="60"]')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('setting-hide-up-to').locator('[data-value="120"]').click();
  await page.getByTestId('sheet-close').click();

  // Search: YouTube's results as they are (Developer Policies), each with its length.
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-search').click();
  await page.getByTestId('search-input').fill('shorts test');
  await page.getByTestId('search-go').click();
  await page.getByTestId('search-youtube').click();
  const results = page.getByTestId('search-youtube-results');
  await expect(results).toContainText('A Short in search');
  await expect(results).toContainText('0:50');
  await expect(results).toContainText('3:45');
});

test('sheets are drawn bigger and wider (user 2026-11-13), more so with a bigger Toolbar size; clips show their age', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await mockApi(page);
  await openApp(page);
  await startSimulatedPlayback(page);
  await page.getByTestId('yt-library').click();
  await page.getByTestId('lib-tab-feed').click();
  const sheet = page.getByTestId('library-sheet');
  const zoom = page.getByTestId('sheet-zoom');
  await expect(zoom).toHaveCSS('zoom', '1.25');
  // 400 px before, now 500: the bigger content has the same room. The zoomed box fills the sheet exactly.
  const sb = (await sheet.boundingBox())!;
  const zb = (await zoom.boundingBox())!;
  expect(Math.round(sb.width)).toBe(500);
  expect(Math.abs(zb.width - sb.width)).toBeLessThan(1);
  expect(Math.abs(zb.height - sb.height)).toBeLessThan(1);
  // Title text 15 px drawn at 18.75 px; the thumbnail 96 px wide at 120.
  const title = page.getByTestId('lib-feed').locator('li').first().locator('.line-clamp-2');
  expect(Math.round((await title.boundingBox())!.height)).toBeGreaterThanOrEqual(23);
  expect(Math.round((await page.getByTestId('lib-feed').locator('img, span.w-24').first().boundingBox())!.width)).toBe(120);
  // Channel · length · age.
  await expect(page.getByTestId('lib-feed').locator('[data-testid="lib-meta"]').first()).toHaveText('Mock Channel · 4:05 · 3 days ago');
  await expectPlayerClear(page);

  await page.getByTestId('sheet-close').click();
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('setting-dock-size').locator('[data-value="xlarge"]').click();
  await expect(zoom).toHaveCSS('zoom', '1.55');
  await page.getByTestId('sheet-close').click();
  await page.getByTestId('yt-queue').click();
  await expect(page.getByTestId('queue-sheet')).toBeVisible();
  await expectPlayerClear(page);
});

test('New: played clips left out, ranked by channels played; hide a clip or its channel; "N hidden · Show"; Channels in New', async ({ page }) => {
  const m = await mockApi(page, { feed: FEED_CHANNELS });
  await openApp(page);
  // Song A2 was played here 2 days ago (JorGu's own memory, 30 days).
  await page.evaluate(() =>
    localStorage.setItem('jorgu:seen', JSON.stringify({ state: { played: { 'aqz-KE-bpKQ': { at: Date.now() - 2 * 86_400_000, ch: 'Band A' } }, hidden: {}, muted: {} }, version: 1 })),
  );
  await page.reload();
  await page.getByTestId('yt-empty-library').click();
  const feed = page.getByTestId('lib-feed');
  const ids = () => feed.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-video-id')));
  await expect(feed).toContainText('Song A1');
  expect(await ids()).toEqual(['M7lc1UVf-VE', 'dQw4w9WgXcQ', 'kJQP7kiw5Fk', '9bZkp7q19f0']);
  const showHidden = page.getByTestId('lib-feed-show-hidden');
  await expect(showHidden).toContainText('1 hidden');

  // Hide one clip, then (from the toast) its whole channel.
  await feed.locator('li[data-video-id="dQw4w9WgXcQ"]').getByTestId('lib-hide').click();
  await expect(feed).not.toContainText('Vlog B1');
  await expect(page.getByTestId('toast')).toContainText('Hidden: Vlog B1');
  await page.getByTestId('toast-action').click();
  await expect(feed).not.toContainText('Vlog B2');
  await expect(page.getByTestId('toast')).toContainText('Channel hidden: Vlogger B');
  await expect(showHidden).toContainText('3 hidden');

  // Show them for a look, with why each was left out; then hide them again.
  await showHidden.click();
  await expect(feed.locator('li')).toHaveCount(5);
  await expect(feed.locator('li[data-video-id="aqz-KE-bpKQ"] [data-testid="lib-mark"]')).toHaveText('Played');
  await expect(feed.locator('li[data-video-id="dQw4w9WgXcQ"]')).toHaveAttribute('data-mark', 'hidden');
  await expect(feed.locator('li[data-video-id="kJQP7kiw5Fk"]')).toHaveAttribute('data-mark', 'muted');
  await showHidden.click();
  await expect(feed.locator('li')).toHaveCount(2);

  // Channels in New: played most first; Vlogger B is off; switch News C off and Vlogger B back on.
  await page.getByTestId('lib-channels').click();
  const list = page.getByTestId('lib-channel-list');
  await expect(list.locator('li').first()).toHaveAttribute('data-channel-id', UCA);
  await expect(list.locator('li').first()).toContainText('played 1×');
  await expect(list.locator(`li[data-channel-id="${UCB}"]`)).toHaveAttribute('data-off', '1');
  await list.locator(`li[data-channel-id="${UCC}"]`).getByTestId('lib-channel-toggle').click();
  await list.locator(`li[data-channel-id="${UCB}"]`).getByTestId('lib-channel-toggle').click();
  await expect(list.locator(`li[data-channel-id="${UCC}"]`)).toHaveAttribute('data-off', '1');
  await expect(list.locator(`li[data-channel-id="${UCB}"]`)).toHaveAttribute('data-off', '0');
  await page.getByTestId('lib-channels-back').click();
  await expect(feed).toContainText('Vlog B2');
  await expect(feed).not.toContainText('News C1');
  // The next refresh asks the Worker to skip News C, so another channel takes its place.
  await page.getByTestId('lib-refresh').click();
  await expect.poll(() => m.calls.filter((c) => c.startsWith('GET /api/yt/feed')).at(-1)).toBe(`GET /api/yt/feed?exclude=${UCC}`);
});

test('Search marks played clips but keeps them; Mix tab: Mixes of songs played most and liked videos', async ({ page }) => {
  await mockApi(page);
  await openApp(page);
  await page.evaluate(() => {
    localStorage.setItem('jorgu:seen', JSON.stringify({ state: { played: { OPf0YbXqDm0: { at: Date.now(), ch: 'Mock Channel' } }, hidden: {}, muted: {} }, version: 1 }));
    const e = (videoId: string, title: string, channel: string, plays: number) => ({ videoId, title, channel, plays, at: Date.now() - plays * 1000 });
    localStorage.setItem('jorgu:history', JSON.stringify({ state: { entries: [e('dQw4w9WgXcQ', 'Played twice', 'Band', 2), e('9bZkp7q19f0', 'Played five times', 'Other', 5)] }, version: 1 }));
  });
  await page.reload();
  await page.getByTestId('yt-empty-library').click();
  await page.getByTestId('lib-tab-search').click();
  await page.getByTestId('search-input').fill('anything');
  await page.getByTestId('search-go').click();
  await page.getByTestId('search-youtube').click();
  const results = page.getByTestId('search-youtube-results');
  await expect(results).toContainText('From YouTube search');
  await expect(results.getByTestId('lib-mark')).toHaveText('Played');
  await expect(results.getByTestId('lib-hide')).toHaveCount(0);

  await page.getByTestId('lib-tab-mix').click();
  await expect(page.getByTestId('lib-mix-played').locator('li')).toHaveText([/Mix · Played five times/, /Mix · Played twice/]);
  await expect(page.getByTestId('lib-mix-liked')).toContainText('Mix · Liked thing');
  await page.getByTestId('lib-mix-played').locator('li button').first().click();
  await expect(page.getByTestId('library-sheet')).toHaveCount(0);
  const q = await queue(page);
  expect(q.items.map((i) => [i.videoId, i.mix])).toEqual([['9bZkp7q19f0', true]]);
  await page.getByTestId('yt-queue').click();
  await expect(page.getByTestId('queue-mix-next')).toBeVisible();
});

