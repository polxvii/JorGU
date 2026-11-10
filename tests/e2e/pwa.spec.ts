import { expect, test } from '@playwright/test';
import { box, expectNoReloads, frameLoads, openApp, revealHeaders, waitForFrames } from './helpers';

test.describe('PWA (§14)', () => {
  test('installable in Chrome: manifest + service worker, no installability errors', async ({ page }) => {
    await openApp(page);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const manifest = await (await page.request.get(manifestHref!)).json();
    expect(manifest).toMatchObject({
      name: 'JorGu',
      display: 'fullscreen',
      orientation: 'landscape',
      lang: 'en',
      start_url: '/',
    });
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 15_000 }).toBe(true);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
  });

  test('Referrer-Policy header is strict-origin-when-cross-origin (§3.9)', async ({ page }) => {
    const res = await page.goto('/');
    expect(res!.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

test.describe('without a service worker (CarPlay in-app browser, §3.10)', () => {
  test.use({ serviceWorkers: 'block' });

  test('app works fully', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
    const before = await frameLoads(page);
    await page.getByTestId('dock-swap').click();
    const yt = await box(page, '[data-surface="youtube"]');
    expect(yt.x).toBeGreaterThan(400);
    await page.getByTestId('pane-fullscreen-0').click();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'fullscreen');
    await page.reload();
    await expect(page.locator('#jorgu-root')).toHaveAttribute('data-mode', 'fullscreen');
    await expectNoReloads(page, before);
  });

  test('swap keeps iframes alive without a service worker', async ({ page }) => {
    await openApp(page);
    // Put a Web pane on the right so there is a same-origin iframe to watch.
    await revealHeaders(page);
    await page.getByTestId('pane-change-1').click();
    await page.getByTestId('pick-web').click();
    await waitForFrames(page, ['web:w1']);
    const before = await frameLoads(page);
    await page.getByTestId('dock-swap').click();
    await page.getByTestId('dock-swap').click();
    await expectNoReloads(page, before);
  });
});
