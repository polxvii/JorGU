import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __jorguFrameLoads?: Record<string, number>;
  }
}

export const SETTINGS_KEY = 'jorgu:settings';

/** Clean app with optional persisted settings (zustand persist format). */
export async function openApp(page: Page, settings?: Record<string, unknown>): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([key, s]) => {
      localStorage.clear();
      if (s) localStorage.setItem(key as string, JSON.stringify({ state: s, version: 1 }));
    },
    [SETTINGS_KEY, settings ?? null] as const,
  );
  await page.reload();
  await waitForFrames(page, ['youtube']);
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

export async function startSimulatedPlayback(page: Page): Promise<void> {
  await page.getByTestId('yt-toggle').click();
  await expect(page.locator('[data-player-rect]')).toHaveAttribute('data-playing', '1');
}
