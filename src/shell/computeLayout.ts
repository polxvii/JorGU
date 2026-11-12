// Pure layout engine (spec §6). Every on-screen rectangle is decided here so the placement rules
// (§3.9 nothing over the YouTube player, §6.3 CSS-only positioning, driver-side mirroring) live in one tested place.
import type { AppRef, DockSize, LayoutSettings, MiniCorner, MiniPlayerSize, PaneIndex, SurfaceId } from '../features/settings/types';
import { surfaceIdOf } from '../features/settings/types';
import { type Rect, bottom, fit16x9, intersects, right } from './geometry';
import { youtubePane } from './layoutActions';
import { type RatioBounds, YT_MIN_WIDTH, ratioBounds, splitFeasible, ytMinHeight } from './splitRatio';

export const L = {
  DOCK: 80,
  HEADER: 40,
  /** Reserved band above the YouTube player for the pane header and ⛶ (nothing may overlap the player). */
  YT_BAND: 56,
  /** Web panes reserve the same band: their header (with the web controls) never covers the site (§9.1). */
  WEB_BAND: 56,
  /** Title + transport row below the player in pane mode. */
  YT_CONTROLS: 88,
  GAP: 16,
  DIVIDER_EXTEND: 16,
  FS_BUTTON: 48,
  FS_MARGIN: 4,
  COLUMN: 72,
  EDGE: 24,
  FLOAT_BUTTON: 64,
  FLOAT_GAP: 8,
  FLOAT_INSET: 32,
  BANNER: 40,
  MINI_MARGIN: 12,
  MINI_HANDLE: 48,
  SHEET_MAX: 400,
  SHEET_MIN: 300,
  /** Floating full-screen buttons: exit, switch, picker, ⏮ ⏯ ⏭, speed (+ web menu on Web). */
  FLOAT_BUTTONS: 7,
  TOAST_H: 56,
  TOAST_MAX_W: 460,
  TOAST_STRIP: 72,
} as const;

export type YtMode = 'pane' | 'mini' | 'fullscreen' | 'hidden';
export type Side = 'left' | 'right';
/** Where a pane sits: left/right side by side, top/bottom when stacked. */
export type PanePos = Side | 'top' | 'bottom';

export interface PaneBox {
  index: PaneIndex;
  app: AppRef;
  side: PanePos;
  rect: Rect;
  header: Rect;
  fsButton: Rect;
}

export interface SurfaceBox {
  id: SurfaceId;
  rect: Rect;
  visible: boolean;
  z: number;
}

export interface LayoutInput {
  viewport: { width: number; height: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
  layout: LayoutSettings;
  youtube: { playing: boolean; miniSticky: boolean; miniSize: MiniPlayerSize; miniCorner?: MiniCorner };
  /** Dock size setting (default 'normal' = 80 px). */
  dockSize?: DockSize;
  bannerCount: number;
  sheetOpen: boolean;
  /** A toast is showing (it must be placed clear of the player). */
  toast?: boolean;
}

export interface LayoutResult {
  driverSide: Side;
  content: Rect;
  banner: Rect | null;
  dock: Rect | null;
  appArea: Rect;
  mode: 'split' | 'single' | 'fullscreen';
  panes: PaneBox[];
  /** Pane on the left edge, or on top when stacked. Side by side, pane 1 always sits on the driver side. */
  firstPane: PaneIndex;
  /** Panes are stacked top/bottom (setting `direction`, or 'auto' on a portrait screen). */
  stacked: boolean;
  /** The content area is taller than wide: Dock along the bottom, sheets slide in from the bottom (or top). */
  portrait: boolean;
  divider: { line: Rect; hit: Rect } | null;
  bounds: RatioBounds | null;
  /** Length the two panes share along the split (width side by side, height stacked), without the gap. */
  splitLength: number;
  surfaces: Partial<Record<SurfaceId, SurfaceBox>>;
  youtube: { mode: YtMode; surface: Rect; player: Rect | null; paneIndex: PaneIndex | null };
  floatingBar: { rect: Rect; rows: number; cols: number } | null;
  edgeStrip: Rect | null;
  controlColumn: Rect | null;
  mini: { rect: Rect; handle: Rect } | null;
  sheet: Rect | null;
  toast: Rect | null;
}

const Z_SURFACE = 1;
const Z_YOUTUBE = 5;
const Z_MINI = 6;

function ytPanePlayer(s: Rect, ytControls: number): Rect {
  const availH = Math.max(0, s.h - L.YT_BAND - ytControls);
  let w = s.w;
  let h = Math.floor((w * 9) / 16);
  if (h > availH) {
    h = availH;
    w = Math.floor((h * 16) / 9);
  }
  return { x: s.x + Math.floor((s.w - w) / 2), y: s.y + L.YT_BAND, w, h };
}

export const DOCK_SIZES: Record<DockSize, number> = { normal: 80, large: 96, xlarge: 112 };

/**
 * Toolbar size (Settings) for every control, not only the Dock (user 2026-11-12): full-screen buttons (`big`) and the
 * YouTube full-screen column, the transport row under the clip title (`row`, `ytControls` = title + row), map buttons.
 * `normal` keeps the original sizes (L.FLOAT_BUTTON, L.COLUMN, L.YT_CONTROLS).
 */
export const CONTROL_SIZES: Record<
  DockSize,
  { big: number; bigIcon: number; column: number; row: number; rowIcon: number; rowNarrow: number; rowWide: number; ytControls: number; map: number; mapIcon: number }
> = {
  normal: { big: 64, bigIcon: 30, column: 72, row: 48, rowIcon: 26, rowNarrow: 44, rowWide: 56, ytControls: 88, map: 56, mapIcon: 28 },
  large: { big: 76, bigIcon: 34, column: 84, row: 56, rowIcon: 30, rowNarrow: 52, rowWide: 64, ytControls: 96, map: 64, mapIcon: 32 },
  xlarge: { big: 88, bigIcon: 38, column: 96, row: 64, rowIcon: 34, rowNarrow: 60, rowWide: 72, ytControls: 104, map: 72, mapIcon: 36 },
};

/** Which corner the mini player uses: 'auto' = bottom, driver side. */
export function miniCornerOf(corner: MiniCorner | undefined, driverRight: boolean): { right: boolean; top: boolean } {
  if (!corner || corner === 'auto') return { right: driverRight, top: false };
  return { right: corner[1] === 'r', top: corner[0] === 't' };
}

/** Mini player in a corner of `area`, its handle always directly above it. */
function miniBox(area: Rect, size: MiniPlayerSize, at: { right: boolean; top: boolean }) {
  // The large size falls back to 356×200 where it doesn't fit (narrow portrait screens).
  const big = size === '480x270' && area.w >= 480 + 2 * L.MINI_MARGIN && area.h >= 270 + L.MINI_HANDLE + 2 * L.MINI_MARGIN;
  const [w, h] = big ? [480, 270] : [356, 200];
  const x = at.right ? right(area) - L.MINI_MARGIN - w : area.x + L.MINI_MARGIN;
  const y = at.top ? area.y + L.MINI_MARGIN + L.MINI_HANDLE : bottom(area) - L.MINI_MARGIN - h;
  const rect = { x, y, w, h };
  return { rect, handle: { x, y: y - L.MINI_HANDLE, w, h: L.MINI_HANDLE } };
}

/**
 * Places a full-height sheet at one edge of `area`. If it would cover `avoid`, it narrows so that at least
 * `avoid.minW` px of `avoid` stay uncovered (the YouTube player keeps ≥ 356 px; the mini player stays whole).
 */
function placeSheet(area: Rect, atRight: boolean, avoid: (Rect & { minW: number }) | null): Rect {
  let sw = Math.max(L.SHEET_MIN, Math.min(L.SHEET_MAX, Math.round(area.w * 0.45)));
  const rectFor = (w: number): Rect => ({ x: atRight ? right(area) - w : area.x, y: area.y, w, h: area.h });
  if (avoid && intersects(rectFor(sw), avoid)) {
    const limit = atRight ? right(area) - avoid.x - avoid.minW : right(avoid) - area.x - avoid.minW;
    sw = Math.min(sw, limit);
  }
  return rectFor(Math.max(0, Math.floor(sw)));
}

/**
 * Portrait: a full-width sheet along the bottom (or top) of `area`. If it would cover `avoid`, it gets shorter so
 * that at least `avoid.minH` px of `avoid` stay uncovered.
 */
function placeBand(area: Rect, atBottom: boolean, avoid: (Rect & { minH: number }) | null): Rect {
  let sh = Math.min(area.h, Math.max(L.SHEET_MIN, Math.round(area.h * 0.55)));
  const rectFor = (h: number): Rect => ({ x: area.x, y: atBottom ? bottom(area) - h : area.y, w: area.w, h });
  if (avoid && intersects(rectFor(sh), avoid)) {
    const limit = atBottom ? bottom(area) - avoid.y - avoid.minH : bottom(avoid) - area.y - avoid.minH;
    sh = Math.min(sh, limit);
  }
  return rectFor(Math.max(0, Math.floor(sh)));
}

/**
 * Free spot for a toast that touches none of `avoid` (player, mini player, sheet…). If there is none and a sheet is
 * open, the toast goes over the bottom of the sheet: the sheet is our own chrome, never the player (§3.9).
 */
function placeToast(area: Rect, avoid: (Rect | null | undefined)[], extra: Rect[] = [], sheet: Rect | null = null): Rect | null {
  const w = Math.max(0, Math.min(L.TOAST_MAX_W, area.w - 24));
  const h = L.TOAST_H;
  const cx = area.x + Math.floor((area.w - w) / 2);
  const candidates: Rect[] = [
    { x: cx, y: bottom(area) - h - 12, w, h },
    { x: cx, y: area.y + 12, w, h },
    ...extra,
  ];
  const blockers = avoid.filter((a): a is Rect => !!a);
  const free = candidates.find((c) => blockers.every((b) => !intersects(c, b)));
  if (free || !sheet) return free ?? null;
  const sw = Math.max(0, Math.min(L.TOAST_MAX_W, sheet.w - 24));
  const inSheet = { x: sheet.x + Math.floor((sheet.w - sw) / 2), y: bottom(sheet) - h - 12, w: sw, h };
  return blockers.every((b) => b === sheet || !intersects(inSheet, b)) ? inSheet : null;
}

/** `r` trimmed to its larger part beside `m` (4 px clear), or `hidden` if that part is narrower than `minW`. */
function clearOf(r: Rect, m: Rect, minW: number, hidden: Rect): Rect {
  if (!intersects(r, m)) return r;
  const before = { ...r, w: Math.max(0, m.x - 4 - r.x) };
  const after = { ...r, x: right(m) + 4, w: Math.max(0, right(r) - right(m) - 4) };
  const best = before.w >= after.w ? before : after;
  return best.w >= minW ? best : hidden;
}

function paneToastCandidates(r: Rect): Rect[] {
  const w = Math.max(0, Math.min(L.TOAST_MAX_W, r.w - 24));
  const x = r.x + Math.floor((r.w - w) / 2);
  return [
    { x, y: bottom(r) - L.TOAST_H - 12, w, h: L.TOAST_H },
    { x, y: r.y + L.HEADER + 8, w, h: L.TOAST_H },
  ];
}

/** Full-screen floating controls: a column-first grid on the driver side, or a short grid along the top in portrait. */
function floatBar(content: Rect, atRight: boolean, portrait: boolean, n: number, button: number, atBottom = false) {
  const step = button + L.FLOAT_GAP;
  let rows: number;
  if (portrait) {
    const maxCols = Math.max(1, Math.min(n, Math.floor((content.w - 2 * L.FLOAT_GAP - L.FLOAT_GAP) / step)));
    rows = Math.ceil(n / maxCols);
  } else {
    rows = Math.max(1, Math.min(n, Math.floor((content.h - 2 * L.FLOAT_GAP - L.FLOAT_GAP) / step)));
  }
  const cols = Math.ceil(n / rows);
  const w = cols * button + (cols + 1) * L.FLOAT_GAP;
  const h = rows * button + (rows + 1) * L.FLOAT_GAP;
  const inset = portrait ? L.MINI_MARGIN : L.FLOAT_INSET;
  const x = atRight ? right(content) - inset - w : content.x + inset;
  const y = portrait
    ? atBottom
      ? bottom(content) - L.MINI_MARGIN - h
      : content.y + L.MINI_MARGIN
    : content.y + Math.floor((content.h - h) / 2);
  return { rect: { x, y, w, h }, rows, cols };
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const CS = CONTROL_SIZES[input.dockSize ?? 'normal'];
  const { viewport, safeArea: sa, layout } = input;
  const driverRight = layout.driverSide === 'right';
  const outer: Rect = {
    x: sa.left,
    y: sa.top,
    w: Math.max(0, viewport.width - sa.left - sa.right),
    h: Math.max(0, viewport.height - sa.top - sa.bottom),
  };
  const bannerH = input.bannerCount * L.BANNER;
  const banner = bannerH > 0 ? { x: outer.x, y: outer.y, w: outer.w, h: bannerH } : null;
  const content: Rect = { x: outer.x, y: outer.y + bannerH, w: outer.w, h: Math.max(0, outer.h - bannerH) };
  const ytIdx = youtubePane(layout);
  const portrait = content.h > content.w;
  const stacked = layout.direction === 'stacked' || (layout.direction === 'auto' && portrait);

  const surfaces: Partial<Record<SurfaceId, SurfaceBox>> = {};
  for (const app of layout.panes) {
    const id = surfaceIdOf(app);
    surfaces[id] = { id, rect: content, visible: false, z: app.kind === 'youtube' ? Z_YOUTUBE : Z_SURFACE };
  }
  surfaces.youtube ??= { id: 'youtube', rect: content, visible: false, z: Z_YOUTUBE };

  const base = {
    driverSide: layout.driverSide,
    content,
    banner,
    firstPane: (driverRight ? 0 : 1) as PaneIndex,
    stacked,
    portrait,
  };
  const showMiniWhenOff = input.youtube.playing || input.youtube.miniSticky;
  const at = miniCornerOf(input.youtube.miniCorner, driverRight);

  // ---------- full screen (§6.5) ----------
  if (layout.fullscreenPane !== null) {
    const fsApp = layout.panes[layout.fullscreenPane];
    if (fsApp.kind === 'youtube') {
      // Controls: a column on the driver side, or a row along the bottom on a portrait screen. When the 16:9 player
      // is limited by the other dimension anyway, the column doubles (two lines of buttons) at no cost to the video.
      const thick = portrait
        ? (content.h - 2 * CS.column) * 16 >= content.w * 9
        : (content.w - 2 * CS.column) * 9 >= content.h * 16;
      const cw = thick ? 2 * CS.column : CS.column;
      const column = portrait
        ? { x: content.x, y: bottom(content) - cw, w: content.w, h: cw }
        : { x: driverRight ? right(content) - cw : content.x, y: content.y, w: cw, h: content.h };
      let area: Rect = portrait
        ? { x: content.x, y: content.y, w: content.w, h: Math.max(0, content.h - cw) }
        : driverRight
          ? { x: content.x, y: content.y, w: content.w - cw, h: content.h }
          : { x: content.x + cw, y: content.y, w: content.w - cw, h: content.h };
      let sheet: Rect | null = null;
      if (input.sheetOpen && portrait) {
        // The player keeps ≥ 201 px of height (→ ≥ 357×201) even after a toast strip comes off.
        sheet = placeBand(area, true, { ...area, minH: 201 + L.TOAST_STRIP });
        area = { ...area, h: area.h - sheet.h };
      } else if (input.sheetOpen) {
        sheet = placeSheet(area, driverRight, { ...area, minW: YT_MIN_WIDTH });
        area = driverRight ? { ...area, w: area.w - sheet.w } : { ...area, x: area.x + sheet.w, w: area.w - sheet.w };
      }
      // Toasts can't go over the player, so the player area gives up a strip at the bottom while one shows.
      let toast: Rect | null = null;
      if (input.toast) {
        area = { ...area, h: Math.max(0, area.h - L.TOAST_STRIP) };
        const w = Math.max(0, Math.min(L.TOAST_MAX_W, area.w - 24));
        toast = { x: area.x + Math.floor((area.w - w) / 2), y: bottom(area) + 8, w, h: L.TOAST_H };
      }
      surfaces.youtube = { id: 'youtube', rect: area, visible: true, z: Z_YOUTUBE };
      return {
        ...base,
        dock: null,
        appArea: content,
        mode: 'fullscreen',
        panes: [],
        divider: null,
        bounds: null,
        splitLength: content.w,
        surfaces,
        youtube: { mode: 'fullscreen', surface: area, player: fit16x9(area), paneIndex: layout.fullscreenPane },
        floatingBar: null,
        edgeStrip: null,
        controlColumn: column,
        mini: null,
        sheet,
        toast,
      };
    }

    const id = surfaceIdOf(fsApp);
    surfaces[id] = { id, rect: content, visible: true, z: Z_SURFACE };
    const mini = showMiniWhenOff ? miniBox(content, input.youtube.miniSize, at) : null;
    if (mini) surfaces.youtube = { id: 'youtube', rect: mini.rect, visible: true, z: Z_MINI };
    // Sheets and the floating bar go to the side (or end) away from the mini player.
    const awayRight = mini && at.right === driverRight ? !driverRight : driverRight;
    let sheet: Rect | null = null;
    if (input.sheetOpen) {
      const m = mini ? { ...mini.handle, h: mini.handle.h + mini.rect.h } : null;
      sheet = portrait
        ? placeBand(content, m ? at.top : true, m ? { ...m, minH: m.h } : null)
        : placeSheet(content, awayRight, m ? { ...m, minW: m.w } : null);
    }
    const bar = sheet
      ? null
      : floatBar(content, awayRight, portrait, L.FLOAT_BUTTONS + (fsApp.kind === 'web' ? 1 : 0), CS.big, !!mini && at.top);
    const toast = input.toast
      ? placeToast(content, [mini?.rect, mini?.handle, sheet, bar?.rect], [], sheet)
      : null;
    // Web: a strip along the driver edge brings the controls back; it stops above the mini player on narrow screens.
    let edge: Rect = { x: driverRight ? right(content) - L.EDGE : content.x, y: content.y, w: L.EDGE, h: content.h };
    if (mini && (intersects(edge, mini.handle) || intersects(edge, mini.rect))) {
      if (at.top) {
        const from = bottom(mini.rect) + 4;
        edge = { ...edge, y: from, h: Math.max(0, bottom(content) - from) };
      } else {
        edge = { ...edge, h: Math.max(0, mini.handle.y - 4 - edge.y) };
      }
    }
    return {
      ...base,
      dock: null,
      appArea: content,
      mode: 'fullscreen',
      panes: [],
      divider: null,
      bounds: null,
      splitLength: content.w,
      surfaces,
      youtube: mini
        ? { mode: 'mini', surface: mini.rect, player: mini.rect, paneIndex: ytIdx }
        : { mode: 'hidden', surface: content, player: null, paneIndex: ytIdx },
      floatingBar: bar,
      edgeStrip: fsApp.kind === 'web' ? edge : null,
      controlColumn: null,
      mini,
      sheet,
      toast,
    };
  }

  // ---------- panes (§6.1, §6.4) ----------
  // Dock: on the driver side, or along the bottom on a portrait screen.
  const D = DOCK_SIZES[input.dockSize ?? 'normal'];
  const dock = portrait
    ? { x: content.x, y: bottom(content) - D, w: content.w, h: D }
    : { x: driverRight ? right(content) - D : content.x, y: content.y, w: D, h: content.h };
  const appArea: Rect = portrait
    ? { x: content.x, y: content.y, w: content.w, h: Math.max(0, content.h - D) }
    : driverRight
      ? { x: content.x, y: content.y, w: Math.max(0, content.w - D), h: content.h }
      : { x: content.x + D, y: content.y, w: Math.max(0, content.w - D), h: content.h };
  const splitLength = Math.max(0, (stacked ? appArea.h : appArea.w) - L.GAP);
  const bounds = ratioBounds(splitLength, ytIdx, stacked ? ytMinHeight(CS.ytControls) : YT_MIN_WIDTH);
  let mode: 'split' | 'single' = layout.mode;
  const ytFits = splitFeasible(bounds) && (!stacked || appArea.w >= YT_MIN_WIDTH);
  if (mode === 'split' && ytIdx !== null && !ytFits) mode = 'single';

  const rects: [Rect | null, Rect | null] = [null, null];
  let divider: LayoutResult['divider'] = null;
  const firstIdx = base.firstPane;
  const secondIdx: PaneIndex = firstIdx === 0 ? 1 : 0;

  if (mode === 'split') {
    const ratio = Math.min(bounds.max, Math.max(bounds.min, layout.splitRatio));
    const len0 = Math.round(splitLength * ratio);
    const firstLen = firstIdx === 0 ? len0 : splitLength - len0;
    // The touch target may grow into a neighbouring pane, but never into the YouTube pane.
    const firstYt = layout.panes[firstIdx].kind === 'youtube';
    const secondYt = layout.panes[secondIdx].kind === 'youtube';
    const ext1 = firstYt ? 0 : secondYt ? L.DIVIDER_EXTEND : L.DIVIDER_EXTEND / 2;
    const ext2 = secondYt ? 0 : firstYt ? L.DIVIDER_EXTEND : L.DIVIDER_EXTEND / 2;
    if (stacked) {
      const gap = { x: appArea.x, y: appArea.y + firstLen, w: appArea.w, h: L.GAP };
      rects[firstIdx] = { x: appArea.x, y: appArea.y, w: appArea.w, h: firstLen };
      rects[secondIdx] = { x: appArea.x, y: bottom(gap), w: appArea.w, h: appArea.h - firstLen - L.GAP };
      divider = { line: gap, hit: { x: gap.x, y: gap.y - ext1, w: gap.w, h: L.GAP + ext1 + ext2 } };
    } else {
      const gap = { x: appArea.x + firstLen, y: appArea.y, w: L.GAP, h: appArea.h };
      rects[firstIdx] = { x: appArea.x, y: appArea.y, w: firstLen, h: appArea.h };
      rects[secondIdx] = { x: right(gap), y: appArea.y, w: appArea.w - firstLen - L.GAP, h: appArea.h };
      divider = { line: gap, hit: { x: gap.x - ext1, y: gap.y, w: L.GAP + ext1 + ext2, h: gap.h } };
    }
  } else {
    rects[layout.focusedPane] = appArea;
  }

  // YouTube placement
  let yt: LayoutResult['youtube'] = { mode: 'hidden', surface: content, player: null, paneIndex: ytIdx };
  let mini: LayoutResult['mini'] = null;
  if (ytIdx !== null && rects[ytIdx]) {
    const s = rects[ytIdx]!;
    yt = { mode: 'pane', surface: s, player: ytPanePlayer(s, CS.ytControls), paneIndex: ytIdx };
  } else if (showMiniWhenOff) {
    mini = miniBox(appArea, input.youtube.miniSize, at);
    yt = { mode: 'mini', surface: mini.rect, player: mini.rect, paneIndex: ytIdx };
  }
  const miniArea = mini ? { ...mini.handle, h: mini.handle.h + mini.rect.h } : null;

  // Sheet, never over the player. Landscape: driver side, or passenger side when YouTube is the driver-side pane.
  // Portrait: a band from the bottom, or from the top when YouTube is the bottom pane or the mini player shows.
  // If it must overlap the YouTube pane, that pane shrinks beside it and still fits a ≥ 356×200 player.
  let sheet: Rect | null = null;
  if (input.sheetOpen && portrait) {
    const ytSecond = yt.mode === 'pane' && mode === 'split' && stacked && yt.paneIndex === secondIdx;
    const atBottom = miniArea ? at.top : !ytSecond;
    const avoid =
      yt.mode === 'pane' ? { ...yt.surface, minH: ytMinHeight(CS.ytControls) } : miniArea ? { ...miniArea, minH: miniArea.h } : null;
    sheet = placeBand(content, atBottom, avoid);
    if (yt.mode === 'pane' && intersects(sheet, yt.surface)) {
      const s = yt.surface;
      const clipped = atBottom ? { ...s, h: sheet.y - s.y } : { ...s, y: bottom(sheet), h: bottom(s) - bottom(sheet) };
      yt = { ...yt, surface: clipped, player: ytPanePlayer(clipped, CS.ytControls) };
    }
  } else if (input.sheetOpen) {
    const ytOnDriverSide = yt.mode === 'pane' && mode === 'split' && yt.paneIndex === 1;
    let atRight = ytOnDriverSide ? !driverRight : driverRight;
    if (miniArea && at.right === atRight) atRight = !atRight;
    const avoid =
      yt.mode === 'pane' ? { ...yt.surface, minW: YT_MIN_WIDTH } : miniArea ? { ...miniArea, minW: miniArea.w } : null;
    sheet = placeSheet(content, atRight, avoid);
    if (yt.mode === 'pane' && intersects(sheet, yt.surface)) {
      const s = yt.surface;
      const clipped = atRight ? { ...s, w: sheet.x - s.x } : { ...s, x: right(sheet), w: right(s) - right(sheet) };
      yt = { ...yt, surface: clipped, player: ytPanePlayer(clipped, CS.ytControls) };
    }
  }

  // Keep the divider clear of the mini player and its handle.
  if (divider && miniArea && intersects(divider.hit, miniArea)) {
    let cut: (r: Rect) => Rect;
    if (!stacked && at.top) {
      const from = bottom(miniArea) + 4;
      cut = (r) => ({ ...r, y: from, h: Math.max(0, bottom(r) - from) });
    } else if (!stacked) {
      const top = miniArea.y - 4;
      cut = (r) => ({ ...r, h: Math.max(0, top - r.y) });
    } else if (!at.right) {
      // Mini player sits at the left: the divider starts after it.
      const from = right(miniArea) + 4;
      cut = (r) => ({ ...r, x: from, w: Math.max(0, right(r) - from) });
    } else {
      const to = miniArea.x - 4;
      cut = (r) => ({ ...r, w: Math.max(0, to - r.x) });
    }
    divider = { line: cut(divider.line), hit: cut(divider.hit) };
  }

  const panes: PaneBox[] = [];
  for (const index of [0, 1] as PaneIndex[]) {
    const rect = rects[index];
    if (!rect) continue;
    const app = layout.panes[index];
    const id = surfaceIdOf(app);
    const surfaceRect = app.kind === 'youtube' ? yt.surface : rect;
    surfaces[id] = { id, rect: surfaceRect, visible: true, z: app.kind === 'youtube' ? Z_YOUTUBE : Z_SURFACE };
    const first = index === firstIdx;
    panes.push({
      index,
      app,
      side:
        mode === 'single'
          ? stacked
            ? 'top'
            : driverRight
              ? 'left'
              : 'right'
          : stacked
            ? first
              ? 'top'
              : 'bottom'
            : first
              ? 'left'
              : 'right',
      rect,
      header: { x: rect.x, y: rect.y, w: rect.w, h: L.HEADER },
      fsButton: {
        x: driverRight ? right(rect) - L.FS_BUTTON - L.FS_MARGIN : rect.x + L.FS_MARGIN,
        y: rect.y + L.FS_MARGIN,
        w: L.FS_BUTTON,
        h: L.FS_BUTTON,
      },
    });
  }
  if (mini) surfaces.youtube = { id: 'youtube', rect: mini.rect, visible: true, z: Z_MINI };

  // Stacked panes on a short screen: the mini player can cross the lower pane's header. Chrome draws above every
  // surface, so trim that chrome beside the mini player, or hide it while the mini player shows.
  if (miniArea) {
    for (const p of panes) {
      const hidden = { x: p.rect.x, y: p.rect.y, w: 0, h: 0 };
      p.header = clearOf(p.header, miniArea, 200, hidden);
      p.fsButton = clearOf(p.fsButton, miniArea, L.FS_BUTTON, hidden);
    }
  }

  const toast = input.toast
    ? placeToast(
        appArea,
        [yt.player, mini?.rect, mini?.handle, sheet],
        panes.filter((p) => p.app.kind !== 'youtube').flatMap((p) => paneToastCandidates(p.rect)),
        sheet,
      )
    : null;

  return {
    ...base,
    dock,
    appArea,
    mode,
    panes,
    divider,
    bounds: mode === 'split' ? bounds : null,
    splitLength,
    surfaces,
    youtube: yt,
    floatingBar: null,
    edgeStrip: null,
    controlColumn: null,
    mini,
    sheet,
    toast,
  };
}
