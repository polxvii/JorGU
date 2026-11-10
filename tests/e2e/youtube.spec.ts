// Real YouTube IFrame player (network required). Spec §8.5, §3.9, M2 acceptance criteria.
import { expect, test, type Page } from '@playwright/test';
import { box, expectPlayerClear, openApp, revealHeaders } from './helpers';

// Google's own IFrame API sample video, plus a second embeddable video for queue tests.
const VIDEO_A = 'M7lc1UVf-VE';
const VIDEO_B = 'aqz-KE-bpKQ';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const yt = (page: Page) => page.evaluate(() => window.__jorgu!.yt());
const PLAYING = 1;
const BUFFERING = 3;

async function pasteAndPlay(page: Page, link: string) {
  const empty = page.getByTestId('yt-empty-paste');
  if (await empty.isVisible()) await empty.click();
  else await page.getByTestId('yt-paste').click();
  await page.getByTestId('paste-input').fill(link);
  await page.getByTestId('paste-play').click();
  await expect.poll(async () => (await yt(page)).state, { timeout: 45_000 }).toBe(PLAYING);
}

async function expectStillPlaying(page: Page, before: { time: number; iframeLoads: number }) {
  await expect.poll(async () => (await yt(page)).time, { timeout: 15_000 }).toBeGreaterThan(before.time + 0.5);
  const now = await yt(page);
  expect([PLAYING, BUFFERING]).toContain(now.state);
  expect(now.iframeLoads, 'player iframe reloaded').toBe(before.iframeLoads);
  await expect(page.locator('iframe[data-jorgu="youtube-player"]')).toHaveCount(1);
}

test('paste a youtu.be link → plays; Referer is sent; no CSP errors', async ({ page }) => {
  const appErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && m.location().url.startsWith('http://localhost')) appErrors.push(m.text().slice(0, 200));
  });
  const referers: (string | null)[] = [];
  page.on('request', async (r) => {
    if (r.url().startsWith('https://www.youtube.com/embed/')) referers.push(await r.headerValue('referer'));
  });

  await openApp(page);
  await pasteAndPlay(page, `https://youtu.be/${VIDEO_A}?si=test`);
  expect(referers.length).toBeGreaterThan(0);
  expect(referers[0]).toMatch(/^http:\/\/localhost:4173\//);
  expect(appErrors).toEqual([]);
  await expectPlayerClear(page);
  const meta = await page.evaluate(() => navigator.mediaSession?.metadata?.artwork?.[0]?.src ?? null);
  expect(meta).toContain(VIDEO_A);
});

test('playback continues through swap, layout toggle, divider drag, full screen, ⇄, and Back', async ({ page }) => {
  await openApp(page);
  await pasteAndPlay(page, `https://www.youtube.com/watch?v=${VIDEO_A}`);
  let s = await yt(page);

  await page.getByTestId('dock-swap').click();
  await expectStillPlaying(page, s);
  await expectPlayerClear(page);

  s = await yt(page);
  const d = await box(page, '[data-testid="divider"]');
  await page.mouse.move(d.x + d.width / 2, d.y + 300);
  await page.mouse.down();
  await page.mouse.move(d.x - 120, d.y + 300, { steps: 6 });
  await page.mouse.up();
  await expectStillPlaying(page, s);

  s = await yt(page);
  await page.getByTestId('dock-layout').click(); // single: focused pane shown; YouTube may become the mini player
  await expectStillPlaying(page, s);
  await expectPlayerClear(page);
  await page.getByTestId('dock-layout').click();

  s = await yt(page);
  await page.getByTestId('pane-fullscreen-0').click(); // Map full screen (YouTube is pane 1 after the swap)
  await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'mini');
  await expectStillPlaying(page, s);
  await expectPlayerClear(page);

  s = await yt(page);
  const map = await box(page, '[data-surface="map"]');
  await page.mouse.click(map.x + map.width / 2, map.y + 100);
  await page.getByTestId('fs-switch').click();
  await expect(page.locator('#jorgu-root')).toHaveAttribute('data-yt', 'fullscreen');
  await expectStillPlaying(page, s);
  await expectPlayerClear(page);

  s = await yt(page);
  await page.goBack();
  await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'split');
  await expectStillPlaying(page, s);
});

test('speed button: 1× → 1.5× → 2×, saved, and re-applied after auto-advance', async ({ page }) => {
  await openApp(page);
  await pasteAndPlay(page, VIDEO_A);
  const speed = page.getByTestId('yt-speed');
  await speed.click();
  await expect(speed).toHaveAttribute('data-rate', '1.5');
  await speed.click();
  await expect(speed).toHaveAttribute('data-rate', '2');
  await expect.poll(async () => (await yt(page)).rate).toBe(2);

  // Queue a second video and jump near the end: auto-advance starts it at 2×.
  await page.getByTestId('yt-paste').click();
  await page.getByTestId('paste-input').fill(`https://youtu.be/${VIDEO_B}`);
  await page.getByTestId('paste-queue').click();
  await page.evaluate(() => window.__jorgu!.seekNearEnd(1.5));
  await expect.poll(async () => page.evaluate(() => window.__jorgu!.queue().index), { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await yt(page)).state, { timeout: 45_000 }).toBe(PLAYING);
  await expect.poll(async () => (await yt(page)).rate, { timeout: 10_000 }).toBe(2);

  await page.reload();
  await expect(page.getByTestId('yt-speed')).toHaveAttribute('data-rate', '2');
});

test('bad video: toast shown beside the player, no endless skipping', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('yt-empty-paste').click();
  await page.getByTestId('paste-input').fill('https://youtu.be/aaaaaaaaaaa');
  await page.getByTestId('paste-play').click();
  await expect(page.getByTestId('toast')).toBeVisible({ timeout: 45_000 });
  await expectPlayerClear(page);
  expect((await yt(page)).state).not.toBe(PLAYING);
});

test('invalid and playlist-only links are explained, not played', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('yt-empty-paste').click();
  await page.getByTestId('paste-input').fill('https://example.com/nope');
  await page.getByTestId('paste-play').click();
  await expect(page.getByTestId('paste-error')).toBeVisible();
  await page.getByTestId('paste-input').fill('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  await page.getByTestId('paste-play').click();
  await expect(page.getByTestId('paste-error')).toBeVisible();
  await revealHeaders(page);
});
