import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __jorguFrameLoads?: Record<string, number>;
    __jorgu?: {
      setPlaying: (playing: boolean) => void;
      yt: () => { hasPlayer: boolean; state: number | null; time: number; duration: number; rate: number | null; iframeLoads: number; visibleRatio: number };
      seekNearEnd: (seconds?: number) => void;
      queue: () => { items: { videoId: string; title?: string; channel?: string }[]; index: number };
    };
  }
}

export const SETTINGS_KEY = 'jorgu:settings';

/** Clean app with optional persisted settings (zustand persist format). */
export async function openApp(page: Page, settings?: Record<string, unknown>): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ([key, s]) => {
      for (const db of ['jorgu-cache', 'jorgu-web']) {
        await new Promise((done) => {
          const req = indexedDB.deleteDatabase(db);
          req.onsuccess = req.onerror = req.onblocked = () => done(null);
        });
      }
      localStorage.clear();
      localStorage.setItem('jorgu:e2e', '1');
      if (s) localStorage.setItem(key as string, JSON.stringify({ state: s, version: 1 }));
    },
    [SETTINGS_KEY, settings ?? null] as const,
  );
  await page.reload();
  // The YouTube surface only mounts once it has a pane or plays; the surface layer is always there.
  await expect(page.locator('#jorgu-root [data-layer="surfaces"]')).toHaveCount(1);
  await page.waitForFunction(() => !!window.__jorgu);
}

/**
 * A responsive test site: "mobile" layout at ≤ 600 px, "desktop" above; a random token proves it didn't reload;
 * a button counts taps (proves taps land through the CSS scale).
 */
export const TEST_SITE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Test site</title>
<style>body{margin:0;font:16px sans-serif;background:#fff;color:#111} button{width:220px;height:64px;font-size:18px}</style>
</head><body><p id="layout"></p><p id="token"></p><button id="tap">Tap me</button><p id="count">0</p>
<script>
var n = 0;
document.getElementById('token').textContent = Math.random().toString(36).slice(2);
document.getElementById('tap').onclick = function () { n += 1; document.getElementById('count').textContent = String(n); };
function measure() {
  var mobile = matchMedia('(max-width: 600px)').matches;
  document.body.dataset.layout = mobile ? 'mobile' : 'desktop';
  document.body.dataset.width = String(innerWidth);
  document.getElementById('layout').textContent = (mobile ? 'mobile ' : 'desktop ') + innerWidth;
}
measure(); addEventListener('resize', measure);
</script></body></html>`;

export interface WebMock {
  checks: string[];
}

/**
 * Serves https://*.test/ sites and answers /api/frame-check: `blocked` hosts are blocked, `unknownHosts` fail the
 * check (like a Worker that can't reach them), everything else is allowed. Needs `serviceWorkers: 'block'`.
 */
export async function mockWeb(page: Page, opts: { blocked?: string[]; unknownHosts?: string[] } = {}): Promise<WebMock> {
  const m: WebMock = { checks: [] };
  await page.route('**/api/frame-check?*', (route) => {
    const target = new URL(route.request().url()).searchParams.get('url') ?? '';
    m.checks.push(target);
    const host = new URL(target).hostname;
    if (opts.unknownHosts?.includes(host)) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"NOT_CONFIGURED"}' });
    const status = opts.blocked?.includes(host) ? 'blocked' : 'allowed';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status, finalUrl: target, reason: 'test' }) });
  });
  await page.route(/^https:\/\/[a-z0-9.-]+\.test\//, (route) => route.fulfill({ contentType: 'text/html', body: TEST_SITE_HTML }));
  return m;
}

export async function waitForFrames(page: Page, names: string[]): Promise<void> {
  await expect
    .poll(async () => frameLoads(page).then((l) => names.every((n) => (l[n] ?? 0) >= 1)), { timeout: 10_000 })
    .toBe(true);
}

export function frameLoads(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({ ...(window.__jorguFrameLoads ?? {}) }));
}

/** Asserts no iframe reloaded since `before` (§6.3). */
export async function expectNoReloads(page: Page, before: Record<string, number>): Promise<void> {
  const after = await frameLoads(page);
  for (const [name, n] of Object.entries(before)) expect(after[name], `iframe ${name} reloaded`).toBe(n);
}

export async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

/** Tap an empty spot of the Dock to reveal auto-hidden pane headers. */
export async function revealHeaders(page: Page): Promise<void> {
  const dock = page.locator('[data-chrome="dock"]');
  if (await dock.count()) {
    const b = (await dock.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height - 6);
  }
}

export interface OverlapReport {
  checked: boolean;
  size?: [number, number];
  problems: string[];
}

/**
 * §3.9: nothing may overlap the YouTube player. Geometric check of every visible [data-chrome] element plus
 * a hit-test grid over the player rectangle.
 */
export function overlapReport(page: Page): Promise<OverlapReport> {
  return page.evaluate(() => {
    const player = document.querySelector<HTMLElement>('[data-player-rect]');
    const surface = player?.closest<HTMLElement>('[data-surface]');
    if (!player || !surface || getComputedStyle(surface).visibility === 'hidden') return { checked: false, problems: [] };
    const r = player.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { checked: false, problems: [] };
    const problems: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-chrome]')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom) {
        problems.push(`chrome "${el.dataset.chrome}" overlaps player`);
      }
    }
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 4; j++) {
        const x = r.left + 2 + ((r.width - 4) * i) / 6;
        const y = r.top + 2 + ((r.height - 4) * j) / 4;
        const top = document.elementFromPoint(x, y);
        if (!top || !(top === player || player.contains(top))) {
          problems.push(`hit (${Math.round(x)},${Math.round(y)}) → ${top ? top.tagName + (top.getAttribute('data-chrome') ?? '') : 'nothing'}`);
        }
      }
    }
    return { checked: true, size: [Math.round(r.width), Math.round(r.height)] as [number, number], problems };
  });
}

export async function expectPlayerClear(page: Page): Promise<OverlapReport> {
  const rep = await overlapReport(page);
  expect(rep.problems, JSON.stringify(rep)).toEqual([]);
  if (rep.checked) {
    expect(rep.size![0]).toBeGreaterThanOrEqual(356);
    expect(rep.size![1]).toBeGreaterThanOrEqual(200);
  }
  return rep;
}

/** Layout-only tests: mark YouTube as playing without loading a real video (test hook). */
export async function startSimulatedPlayback(page: Page): Promise<void> {
  await page.evaluate(() => window.__jorgu!.setPlaying(true));
}
