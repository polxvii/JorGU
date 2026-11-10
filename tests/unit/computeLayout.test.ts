import { describe, expect, it } from 'vitest';
import { type AppRef, defaultSettings, type LayoutSettings, type MiniPlayerSize } from '../../src/features/settings/types';
import { computeLayout, type LayoutInput, type LayoutResult, L } from '../../src/shell/computeLayout';
import { type Rect, bottom, intersects } from '../../src/shell/geometry';
import { YT_MIN_HEIGHT } from '../../src/shell/splitRatio';

const NO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

function input(over: Omit<Partial<LayoutInput>, 'layout'> & { layout?: Partial<LayoutSettings> } = {}): LayoutInput {
  return {
    viewport: { width: 1024, height: 600 },
    safeArea: NO_SAFE,
    youtube: { playing: false, miniSticky: false, miniSize: '356x200' },
    bannerCount: 0,
    sheetOpen: false,
    ...over,
    layout: { ...defaultSettings().layout, ...(over.layout ?? {}) },
  };
}

function chromeRects(r: LayoutResult): [string, Rect][] {
  const out: [string, Rect][] = [];
  if (r.dock) out.push(['dock', r.dock]);
  if (r.banner) out.push(['banner', r.banner]);
  if (r.divider) out.push(['divider', r.divider.hit]);
  if (r.sheet) out.push(['sheet', r.sheet]);
  if (r.floatingBar) out.push(['floatingBar', r.floatingBar.rect]);
  if (r.edgeStrip) out.push(['edgeStrip', r.edgeStrip]);
  if (r.controlColumn) out.push(['controlColumn', r.controlColumn]);
  if (r.mini) out.push(['miniHandle', r.mini.handle]);
  if (r.toast) out.push(['toast', r.toast]);
  for (const p of r.panes) {
    out.push([`header${p.index}`, p.header], [`fs${p.index}`, p.fsButton]);
  }
  return out;
}

describe('computeLayout defaults (§6.4)', () => {
  const r = computeLayout(input());

  it('split 50/50, YouTube left, Map right, Dock on the right edge', () => {
    expect(r.mode).toBe('split');
    expect(r.dock).toEqual({ x: 944, y: 0, w: 80, h: 600 });
    const [yt, map] = [r.panes.find((p) => p.index === 0)!, r.panes.find((p) => p.index === 1)!];
    expect(yt.app.kind).toBe('youtube');
    expect(yt.rect).toEqual({ x: 0, y: 0, w: 464, h: 600 });
    expect(map.rect).toEqual({ x: 480, y: 0, w: 464, h: 600 });
    expect(r.divider!.line).toEqual({ x: 464, y: 0, w: L.GAP, h: 600 });
  });

  it('places the YouTube player below the header band, 16:9', () => {
    expect(r.youtube.mode).toBe('pane');
    expect(r.youtube.player).toEqual({ x: 0, y: L.YT_BAND, w: 464, h: 261 });
  });

  it('⛶ sits in the top corner nearest the driver', () => {
    const map = r.panes.find((p) => p.index === 1)!;
    expect(map.fsButton.x + map.fsButton.w).toBe(944 - L.FS_MARGIN);
    expect(map.fsButton.y).toBe(L.FS_MARGIN);
  });

  it('divider touch target never extends into the YouTube pane', () => {
    expect(r.divider!.hit.x).toBe(464);
  });
});

describe('driver side mirrors everything (§6.4)', () => {
  const W = 1024;
  const mirror = (rc: Rect): Rect => ({ ...rc, x: W - rc.x - rc.w });
  for (const fs of [null, 0, 1] as const) {
    it(`mirrors layout (fullscreenPane=${fs})`, () => {
      const right = computeLayout(input({ layout: { fullscreenPane: fs }, youtube: { playing: true, miniSticky: false, miniSize: '356x200' } }));
      const left = computeLayout(input({ layout: { driverSide: 'left', fullscreenPane: fs }, youtube: { playing: true, miniSticky: false, miniSize: '356x200' } }));
      const a = Object.fromEntries(chromeRects(right).map(([k, v]) => [k, mirror(v)]));
      const b = Object.fromEntries(chromeRects(left));
      expect(b).toEqual(a);
      for (const p of right.panes) expect(left.panes.find((q) => q.index === p.index)!.rect).toEqual(mirror(p.rect));
      if (right.youtube.player) expect(left.youtube.player).toEqual(mirror(right.youtube.player));
    });
  }
});

describe('full screen (§6.5)', () => {
  it('non-YouTube full screen: no dock/headers, floating bar on driver side, mini player on passenger side', () => {
    const r = computeLayout(input({ layout: { fullscreenPane: 1 }, youtube: { playing: true, miniSticky: false, miniSize: '356x200' } }));
    expect(r.mode).toBe('fullscreen');
    expect(r.dock).toBeNull();
    expect(r.panes).toHaveLength(0);
    expect(r.surfaces.map).toMatchObject({ visible: true, rect: { x: 0, y: 0, w: 1024, h: 600 } });
    expect(r.youtube.mode).toBe('mini');
    expect(r.mini!.rect).toEqual({ x: L.MINI_MARGIN, y: 600 - L.MINI_MARGIN - 200, w: 356, h: 200 });
    expect(r.floatingBar!.rect.x).toBeGreaterThan(512);
  });

  it('YouTube full screen keeps a control column beside the player', () => {
    const r = computeLayout(input({ layout: { fullscreenPane: 0 } }));
    expect(r.controlColumn).toEqual({ x: 1024 - L.COLUMN, y: 0, w: L.COLUMN, h: 600 });
    expect(intersects(r.controlColumn!, r.youtube.player!)).toBe(false);
    expect(r.floatingBar).toBeNull();
  });

  it('Web full screen: the floating bar has room for the Web menu button too', () => {
    const web: AppRef = { kind: 'web', id: 'w1', url: 'https://a.example/' };
    for (const viewport of [{ width: 1024, height: 600 }, { width: 932, height: 430 }, { width: 430, height: 932 }]) {
      const r = computeLayout(input({ viewport, layout: { panes: [{ kind: 'youtube' }, web], fullscreenPane: 1 } }));
      const bar = r.floatingBar!;
      expect(bar.rows * bar.cols, JSON.stringify(viewport)).toBeGreaterThanOrEqual(L.FLOAT_BUTTONS + 1);
      const map = computeLayout(input({ viewport, layout: { fullscreenPane: 1 } })).floatingBar!;
      expect(map.rows * map.cols).toBeGreaterThanOrEqual(L.FLOAT_BUTTONS);
    }
  });

  it('edge strip only over Web surfaces', () => {
    const web: AppRef = { kind: 'web', id: 'w1', url: '' };
    const r = computeLayout(input({ layout: { panes: [{ kind: 'youtube' }, web], fullscreenPane: 1 } }));
    expect(r.edgeStrip).toEqual({ x: 1024 - L.EDGE, y: 0, w: L.EDGE, h: 600 });
    expect(computeLayout(input({ layout: { fullscreenPane: 1 } })).edgeStrip).toBeNull();
  });

  it('paused YouTube off-pane is hidden unless sticky', () => {
    expect(computeLayout(input({ layout: { fullscreenPane: 1 } })).youtube.mode).toBe('hidden');
    expect(computeLayout(input({ layout: { fullscreenPane: 1 }, youtube: { playing: false, miniSticky: true, miniSize: '356x200' } })).youtube.mode).toBe('mini');
  });
});

describe('narrow screens', () => {
  it('falls back to single when a 356 px YouTube pane cannot fit in split', () => {
    const r = computeLayout(input({ viewport: { width: 560, height: 400 } }));
    expect(r.mode).toBe('single');
  });

  it('iPhone 16 Pro Max landscape with safe areas keeps split and a ≥ 356 px player', () => {
    const r = computeLayout(input({ viewport: { width: 932, height: 430 }, safeArea: { top: 0, right: 59, bottom: 21, left: 59 } }));
    expect(r.mode).toBe('split');
    expect(r.youtube.player!.w).toBeGreaterThanOrEqual(356);
    expect(r.youtube.player!.h).toBeGreaterThanOrEqual(200);
    expect(r.dock!.x + r.dock!.w).toBe(932 - 59);
  });
});

describe('§3.9 invariants across every combination', () => {
  const viewports: [number, number, typeof NO_SAFE][] = [
    [800, 480, NO_SAFE],
    [1024, 600, NO_SAFE],
    [1280, 720, NO_SAFE],
    [1920, 720, NO_SAFE],
    [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }],
    // Portrait: iPhone 16 Pro Max upright, smaller phones, a tablet.
    [430, 932, { top: 59, right: 0, bottom: 34, left: 0 }],
    [390, 844, NO_SAFE],
    [375, 667, NO_SAFE],
    [768, 1024, NO_SAFE],
  ];
  const paneSets: [AppRef, AppRef][] = [
    [{ kind: 'youtube' }, { kind: 'map' }],
    [{ kind: 'map' }, { kind: 'youtube' }],
    [{ kind: 'dashboard' }, { kind: 'map' }],
    [{ kind: 'web', id: 'w1', url: '' }, { kind: 'youtube' }],
    [{ kind: 'youtube' }, { kind: 'web', id: 'w2', url: '' }],
    [{ kind: 'web', id: 'w1', url: '' }, { kind: 'web', id: 'w2', url: '' }],
  ];
  let checked = 0;

  it('never puts chrome over the player; player ≥ 356×200; YouTube pane ≥ 356 px', () => {
    for (const [w, h, safeArea] of viewports)
      for (const direction of ['auto', 'side', 'stacked'] as const)
      for (const panes of paneSets)
        for (const driverSide of ['right', 'left'] as const)
          for (const mode of ['split', 'single'] as const)
            for (const focusedPane of [0, 1] as const)
              for (const fullscreenPane of [null, 0, 1] as const)
                for (const playing of [false, true])
                  for (const miniSize of ['356x200', '480x270'] as MiniPlayerSize[])
                    for (const sheetOpen of [false, true])
                      for (const bannerCount of [0, 1])
                        for (const toast of [false, true]) {
                        const r = computeLayout({
                          viewport: { width: w, height: h },
                          safeArea,
                          layout: { mode, direction, splitRatio: 0.3, panes, focusedPane, fullscreenPane, driverSide },
                          youtube: { playing, miniSticky: false, miniSize },
                          bannerCount,
                          sheetOpen,
                          toast,
                        });
                        const ctx = JSON.stringify({ w, h, direction, panes: panes.map((p) => p.kind), driverSide, mode, focusedPane, fullscreenPane, playing, miniSize, sheetOpen, bannerCount, toast });
                        const player = r.youtube.player;
                        if (player) {
                          expect(player.w, ctx).toBeGreaterThanOrEqual(356);
                          expect(player.h, ctx).toBeGreaterThanOrEqual(200);
                          for (const [name, rc] of chromeRects(r)) {
                            expect(intersects(rc, player), `${name} overlaps player: ${ctx}`).toBe(false);
                          }
                        }
                        if (r.mode === 'split') {
                          for (const p of r.panes) {
                            if (p.app.kind === 'youtube') expect(p.rect.w, ctx).toBeGreaterThanOrEqual(356);
                            if (p.app.kind === 'youtube' && r.stacked) expect(p.rect.h, ctx).toBeGreaterThanOrEqual(YT_MIN_HEIGHT);
                            if (r.dock) expect(intersects(p.rect, r.dock), `pane under dock: ${ctx}`).toBe(false);
                          }
                          expect(intersects(r.panes[0].rect, r.panes[1].rect), `panes overlap: ${ctx}`).toBe(false);
                        }
                        checked++;
                      }
    expect(checked).toBeGreaterThan(100_000);
  }, 120_000);
});

describe('top/bottom split (portrait, setting `direction`)', () => {
  const PHONE = { viewport: { width: 430, height: 932 }, safeArea: { top: 59, right: 0, bottom: 34, left: 0 } };

  it('auto on an upright phone: panes stacked, YouTube on top, Dock along the bottom, divider horizontal', () => {
    const r = computeLayout(input(PHONE));
    expect(r.portrait).toBe(true);
    expect(r.stacked).toBe(true);
    expect(r.mode).toBe('split');
    expect(r.dock).toEqual({ x: 0, y: 932 - 34 - L.DOCK, w: 430, h: L.DOCK });
    const [top, bottomPane] = [r.panes.find((p) => p.side === 'top')!, r.panes.find((p) => p.side === 'bottom')!];
    expect(top.app.kind).toBe('youtube');
    expect(bottomPane.app.kind).toBe('map');
    expect(top.rect).toMatchObject({ x: 0, y: 59, w: 430 });
    expect(r.divider!.line).toMatchObject({ x: 0, w: 430, h: L.GAP, y: bottom(top.rect) });
    expect(r.divider!.hit.y).toBe(bottom(top.rect)); // never extends into the YouTube pane
    expect(bottomPane.rect.y).toBe(bottom(r.divider!.line));
    expect(r.youtube.player!.w).toBeGreaterThanOrEqual(356);
  });

  it('auto on a landscape screen stays side by side', () => {
    const r = computeLayout(input());
    expect(r.stacked).toBe(false);
    expect(r.portrait).toBe(false);
  });

  it('"side by side" forced on an upright phone falls back to one pane (YouTube needs 356 px)', () => {
    const r = computeLayout(input({ ...PHONE, layout: { direction: 'side' } }));
    expect(r.stacked).toBe(false);
    expect(r.mode).toBe('single');
  });

  it('"top & bottom" forced on a landscape screen stacks when YouTube still fits', () => {
    const r = computeLayout(input({ viewport: { width: 1280, height: 800 }, layout: { direction: 'stacked' } }));
    expect(r.stacked).toBe(true);
    expect(r.mode).toBe('split');
    const yt = r.panes.find((p) => p.app.kind === 'youtube')!;
    expect(yt.rect.h).toBeGreaterThanOrEqual(YT_MIN_HEIGHT);
    expect(r.dock!.h).toBe(800); // Dock stays on the driver side on a landscape screen
  });

  it('a sheet slides up over the bottom pane and leaves the top YouTube player alone', () => {
    const before = computeLayout(input(PHONE));
    const r = computeLayout(input({ ...PHONE, sheetOpen: true }));
    expect(r.sheet).toMatchObject({ x: 0, w: 430 });
    expect(bottom(r.sheet!)).toBe(932 - 34);
    expect(intersects(r.sheet!, r.youtube.player!)).toBe(false);
    expect(r.youtube.player).toEqual(before.youtube.player);
  });

  it('with YouTube in the bottom pane, the sheet comes from the top', () => {
    const r = computeLayout(input({ ...PHONE, sheetOpen: true, layout: { panes: [{ kind: 'map' }, { kind: 'youtube' }] } }));
    expect(r.sheet!.y).toBe(59);
    expect(intersects(r.sheet!, r.youtube.player!)).toBe(false);
    expect(r.youtube.player!.w).toBeGreaterThanOrEqual(356);
  });

  it('YouTube full screen upright: controls in a row along the bottom, full-width player', () => {
    const r = computeLayout(input({ ...PHONE, layout: { fullscreenPane: 0 } }));
    expect(r.controlColumn).toEqual({ x: 0, y: 932 - 34 - L.COLUMN, w: 430, h: L.COLUMN });
    expect(r.youtube.player!.w).toBe(430);
  });

  it('the 480×270 mini player falls back to 356×200 where it does not fit', () => {
    const r = computeLayout(
      input({ ...PHONE, layout: { fullscreenPane: 1 }, youtube: { playing: true, miniSticky: false, miniSize: '480x270' } }),
    );
    expect(r.mini!.rect).toMatchObject({ w: 356, h: 200 });
  });
});
