// M2b client flows with /api mocked (the real Worker is covered by tests/worker). Spec §8.1–8.4, §8.8.
import { expect, test, type Page, type Route } from '@playwright/test';
import { expectPlayerClear, openApp, startSimulatedPlayback } from './helpers';

// page.route can't see requests that go through a service worker, so mocking needs the SW blocked.
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 60_000 });

const VIDEO_A = 'M7lc1UVf-VE';
const VIDEO_B = 'aqz-KE-bpKQ';
const v = (videoId: string, title: string, channel = 'Mock Channel') => ({ videoId, title, channel, thumb: '' });

const FEED = [v(VIDEO_A, 'Feed video one'), v(VIDEO_B, 'Feed video two')];
const PLAYLISTS = [
  { id: 'PLroadtrip0001', title: 'Road trip', count: 3, thumb: '' },
  { id: 'PLnews0000002', title: 'News', count: 1, thumb: '' },
];
const ROAD = [v(VIDEO_A, 'Road Song One'), v(VIDEO_B, 'Road Song Two'), v('dQw4w9WgXcQ', 'เพลงรักฤดูร้อน', 'วงไทย')];
const NEWS = [v('9bZkp7q19f0', 'Morning news')];
const LIKED = [v('kJQP7kiw5Fk', 'Liked thing')];
const SEARCH = [v('OPf0YbXqDm0', 'From YouTube search')];

interface Mock {
  connected: boolean;
  reauth: boolean;
  calls: string[];
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
        return json({ items: FEED }, 200, 42);
      case '/api/yt/playlists':
        return json({ items: PLAYLISTS }, 200, 1);
      case '/api/yt/playlist-items':
        return json({ items: url.searchParams.get('id') === 'PLroadtrip0001' ? ROAD : NEWS }, 200, 1);
      case '/api/yt/liked':
        return json({ items: LIKED }, 200, 1);
      case '/api/yt/popular': {
        const cat = url.searchParams.get('category');
        if (cat === '29') return json({ items: [] }, 200, 1);
        return json({ items: [v(VIDEO_B, cat === '10' ? 'Top music' : cat ? `Top ${cat}` : 'Top trending')] }, 200, 1);
      }
      case '/api/yt/categories':
        return json({ items: [{ id: '24', title: 'Entertainment' }, { id: '10', title: 'Music' }, { id: '29', title: 'Nonprofits' }] }, 200, 1);
      case '/api/yt/search':
        return json({ items: SEARCH }, 200, 100);
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

  // Second visit within the TTL comes from IndexedDB, not the network.
  const feedCalls = countCalls(m, 'GET /api/yt/feed');
  await page.getByTestId('lib-tab-feed').click();
  await expect(feed).toContainText('Feed video one');
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
  await expect(chips).toHaveText(['All', 'Music', 'Entertainment', 'Nonprofits']);
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
