import { expect, test, type Page } from '@playwright/test';
import { box, expectPlayerClear, openApp, startSimulatedPlayback } from './helpers';

const W = 1024;

async function rects(page: Page) {
  const out: Record<string, { x: number; width: number }> = {};
  for (const sel of ['[data-chrome="dock"]', '[data-testid="pane-fullscreen-0"]', '[data-testid="pane-fullscreen-1"]', '[data-surface="youtube"]', '[data-surface="map"]']) {
    const b = await box(page, sel);
    out[sel] = { x: Math.round(b.x), width: Math.round(b.width) };
  }
  return out;
}

test('driver side "left" mirrors the layout (§6.4)', async ({ page }) => {
  await openApp(page);
  const right = await rects(page);
  await openApp(page, { layout: { driverSide: 'left' } });
  const left = await rects(page);
  for (const [sel, r] of Object.entries(right)) {
    expect(left[sel], sel).toEqual({ x: W - r.x - r.width, width: r.width });
  }
});

test('mirrored full screen: mini player bottom-left (driver side), the map toolbar on that side above it', async ({ page }) => {
  await openApp(page, { layout: { driverSide: 'left' } });
  await startSimulatedPlayback(page);
  await page.getByTestId('pane-fullscreen-1').click();
  const s = await box(page, '[data-surface="map"]');
  await page.mouse.click(s.x + s.width / 2, s.y + 100);
  const controls = await box(page, '[data-testid="map-controls"]');
  const mini = await box(page, '[data-player-rect]');
  expect(mini.x).toBeLessThan(W / 2);
  expect(controls.x).toBeLessThan(W / 2);
  expect(controls.y + controls.height).toBeLessThanOrEqual(mini.y);
  await expectPlayerClear(page);
});
