import { expect, test } from '@playwright/test';
import { box, expectNoReloads, expectPlayerClear, frameLoads, openApp } from './helpers';

async function dragDividerTo(page: import('@playwright/test').Page, x: number) {
  const d = await box(page, '[data-testid="divider"]');
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, d.y + d.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.describe('divider (§6.2)', () => {
  test('resizes, clamps, snaps, and keeps YouTube ≥ 356 px', async ({ page }) => {
    await openApp(page);
    const before = await frameLoads(page);
    const divider = page.getByTestId('divider');

    await dragDividerTo(page, 100); // far left → clamp at the YouTube minimum
    const yt = await box(page, '[data-surface="youtube"]');
    expect(yt.width).toBeGreaterThanOrEqual(356);
    expect(yt.width).toBeLessThan(400);
    await expectPlayerClear(page);

    await dragDividerTo(page, 1000); // far right → 70 %
    await expect(divider).toHaveAttribute('aria-valuenow', '70');

    await dragDividerTo(page, 464 + 8 - 15); // near 50 % → snaps
    await expect(divider).toHaveAttribute('aria-valuenow', '50');

    await expectNoReloads(page, before);
  });

  test('keyboard arrows move the divider', async ({ page }) => {
    await openApp(page);
    const divider = page.getByTestId('divider');
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '55');
  });
});
