// Pure layout engine (spec §6). Every on-screen rectangle is decided here so the placement rules
// (§3.9 nothing over the YouTube player, §6.3 CSS-only positioning, driver-side mirroring) live in one tested place.
import type { AppRef, LayoutSettings, MiniPlayerSize, PaneIndex, SurfaceId } from '../features/settings/types';
import { surfaceIdOf } from '../features/settings/types';
import { type Rect, bottom, fit16x9, intersects, right } from './geometry';
import { youtubePane } from './layoutActions';
import { type RatioBounds, YT_MIN_WIDTH, ratioBounds, splitFeasible } from './splitRatio';

export const L = {
  DOCK: 80,
  HEADER: 40,
  /** Reserved band above the YouTube player for the pane header and ⛶ (nothing may overlap the player). */
  YT_BAND: 56,
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
  REVEAL: 20,
  FLOAT_BUTTONS: 7,
  TOAST_H: 56,
  TOAST_MAX_W: 460,
  TOAST_STRIP: 72,
} as const;

export type YtMode = 'pane' | 'mini' | 'fullscreen' | 'hidden';
export type Side = 'left' | 'right';

export interface PaneBox {
  index: PaneIndex;
  app: AppRef;
  side: Side;
  rect: Rect;
  header: Rect;
  fsButton: Rect;
  /** Transparent strip over iframe content that brings the header back. */
  revealStrip: Rect | null;
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
  youtube: { playing: boolean; miniSticky: boolean; miniSize: MiniPlayerSize };
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
  /** Index of the pane on the left edge (pane 1 always sits on the driver side). */
  leftPane: PaneIndex;
  divider: { line: Rect; hit: Rect } | null;
  bounds: RatioBounds | null;
  usableWidth: number;
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

function ytPanePlayer(s: Rect): Rect {
  const availH = Math.max(0, s.h - L.YT_BAND - L.YT_CONTROLS);
  let w = s.w;
  let h = Math.floor((w * 9) / 16);
  if (h > availH) {
    h = availH;
    w = Math.floor((h * 16) / 9);
  }
  return { x: s.x + Math.floor((s.w - w) / 2), y: s.y + L.YT_BAND, w, h };
}

function miniBox(area: Rect, size: MiniPlayerSize, driverRight: boolean) {
  const [w, h] = size === '480x270' ? [480, 270] : [356, 200];
  const x = driverRight ? area.x + L.MINI_MARGIN : right(area) - L.MINI_MARGIN - w;
  const y = bottom(area) - L.MINI_MARGIN - h;
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

/** First candidate (bottom-centre, top-centre, then extras) that avoids every rectangle in `avoid`. */
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

function paneToastCandidates(r: Rect): Rect[] {
  const w = Math.max(0, Math.min(L.TOAST_MAX_W, r.w - 24));
  const x = r.x + Math.floor((r.w - w) / 2);
  return [
    { x, y: bottom(r) - L.TOAST_H - 12, w, h: L.TOAST_H },
    { x, y: r.y + L.HEADER + 8, w, h: L.TOAST_H },
  ];
}

function floatBar(content: Rect, driverRight: boolean) {
  const n = L.FLOAT_BUTTONS;
  const step = L.FLOAT_BUTTON + L.FLOAT_GAP;
  const rows = Math.max(1, Math.min(n, Math.floor((content.h - 2 * L.FLOAT_GAP - L.FLOAT_GAP) / step)));
  const cols = Math.ceil(n / rows);
  const w = cols * L.FLOAT_BUTTON + (cols + 1) * L.FLOAT_GAP;
  const h = rows * L.FLOAT_BUTTON + (rows + 1) * L.FLOAT_GAP;
  const x = driverRight ? right(content) - L.FLOAT_INSET - w : content.x + L.FLOAT_INSET;
  const y = content.y + Math.floor((content.h - h) / 2);
  return { rect: { x, y, w, h }, rows, cols };
}

export function computeLayout(input: LayoutInput): LayoutResult {
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
    leftPane: (driverRight ? 0 : 1) as PaneIndex,
  };
  const showMiniWhenOff = input.youtube.playing || input.youtube.miniSticky;

  // ---------- full screen (§6.5) ----------
  if (layout.fullscreenPane !== null) {
    const fsApp = layout.panes[layout.fullscreenPane];
    if (fsApp.kind === 'youtube') {
      const column = { x: driverRight ? right(content) - L.COLUMN : content.x, y: content.y, w: L.COLUMN, h: content.h };
      let area: Rect = driverRight
        ? { x: content.x, y: content.y, w: content.w - L.COLUMN, h: content.h }
        : { x: content.x + L.COLUMN, y: content.y, w: content.w - L.COLUMN, h: content.h };
      let sheet: Rect | null = null;
      if (input.sheetOpen) {
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
        usableWidth: content.w,
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
    const mini = showMiniWhenOff ? miniBox(content, input.youtube.miniSize, driverRight) : null;
    if (mini) surfaces.youtube = { id: 'youtube', rect: mini.rect, visible: true, z: Z_MINI };
    let sheet: Rect | null = null;
    if (input.sheetOpen) {
      const avoid = mini ? { ...mini.handle, h: mini.handle.h + mini.rect.h, minW: mini.rect.w } : null;
      sheet = placeSheet(content, driverRight, avoid);
    }
    const bar = sheet ? null : floatBar(content, driverRight);
    const toast = input.toast
      ? placeToast(content, [mini?.rect, mini?.handle, sheet, bar?.rect], [], sheet)
      : null;
    return {
      ...base,
      dock: null,
      appArea: content,
      mode: 'fullscreen',
      panes: [],
      divider: null,
      bounds: null,
      usableWidth: content.w,
      surfaces,
      youtube: mini
        ? { mode: 'mini', surface: mini.rect, player: mini.rect, paneIndex: ytIdx }
        : { mode: 'hidden', surface: content, player: null, paneIndex: ytIdx },
      floatingBar: bar,
      edgeStrip: fsApp.kind === 'web'
        ? { x: driverRight ? right(content) - L.EDGE : content.x, y: content.y, w: L.EDGE, h: content.h }
        : null,
      controlColumn: null,
      mini,
      sheet,
      toast,
    };
  }

  // ---------- panes (§6.1, §6.4) ----------
  const dock = { x: driverRight ? right(content) - L.DOCK : content.x, y: content.y, w: L.DOCK, h: content.h };
  const appArea: Rect = driverRight
    ? { x: content.x, y: content.y, w: Math.max(0, content.w - L.DOCK), h: content.h }
    : { x: content.x + L.DOCK, y: content.y, w: Math.max(0, content.w - L.DOCK), h: content.h };
  const usableWidth = Math.max(0, appArea.w - L.GAP);
  const bounds = ratioBounds(usableWidth, ytIdx);
  let mode: 'split' | 'single' = layout.mode;
  if (mode === 'split' && ytIdx !== null && !splitFeasible(bounds)) mode = 'single';

  const rects: [Rect | null, Rect | null] = [null, null];
  let divider: LayoutResult['divider'] = null;
  const leftIdx = base.leftPane;
  const rightIdx: PaneIndex = leftIdx === 0 ? 1 : 0;

  if (mode === 'split') {
    const ratio = Math.min(bounds.max, Math.max(bounds.min, layout.splitRatio));
    const w0 = Math.round(usableWidth * ratio);
    const leftW = leftIdx === 0 ? w0 : usableWidth - w0;
    const leftRect = { x: appArea.x, y: appArea.y, w: leftW, h: appArea.h };
    const gap = { x: appArea.x + leftW, y: appArea.y, w: L.GAP, h: appArea.h };
    const rightRect = { x: right(gap), y: appArea.y, w: appArea.w - leftW - L.GAP, h: appArea.h };
    rects[leftIdx] = leftRect;
    rects[rightIdx] = rightRect;
    // The touch target may grow into a neighbouring pane, but never into the YouTube pane.
    const leftYt = layout.panes[leftIdx].kind === 'youtube';
    const rightYt = layout.panes[rightIdx].kind === 'youtube';
    const extL = leftYt ? 0 : rightYt ? L.DIVIDER_EXTEND : L.DIVIDER_EXTEND / 2;
    const extR = rightYt ? 0 : leftYt ? L.DIVIDER_EXTEND : L.DIVIDER_EXTEND / 2;
    divider = { line: gap, hit: { x: gap.x - extL, y: gap.y, w: L.GAP + extL + extR, h: gap.h } };
  } else {
    rects[layout.focusedPane] = appArea;
  }

  // YouTube placement
  let yt: LayoutResult['youtube'] = { mode: 'hidden', surface: content, player: null, paneIndex: ytIdx };
  let mini: LayoutResult['mini'] = null;
  if (ytIdx !== null && rects[ytIdx]) {
    const s = rects[ytIdx]!;
    yt = { mode: 'pane', surface: s, player: ytPanePlayer(s), paneIndex: ytIdx };
  } else if (showMiniWhenOff) {
    mini = miniBox(appArea, input.youtube.miniSize, driverRight);
    yt = { mode: 'mini', surface: mini.rect, player: mini.rect, paneIndex: ytIdx };
  }

  // Sheet: driver side, or passenger side when YouTube is the driver-side pane. Never over the player:
  // if it must overlap the YouTube pane, that pane shrinks beside it (still ≥ 356 px).
  let sheet: Rect | null = null;
  if (input.sheetOpen) {
    const ytOnDriverSide = yt.mode === 'pane' && mode === 'split' && yt.paneIndex === 1;
    const atRight = ytOnDriverSide ? !driverRight : driverRight;
    const avoid =
      yt.mode === 'pane'
        ? { ...yt.surface, minW: YT_MIN_WIDTH }
        : mini
          ? { ...mini.handle, h: mini.handle.h + mini.rect.h, minW: mini.rect.w }
          : null;
    sheet = placeSheet(content, atRight, avoid);
    if (yt.mode === 'pane' && intersects(sheet, yt.surface)) {
      const s = yt.surface;
      const clipped = atRight ? { ...s, w: sheet.x - s.x } : { ...s, x: right(sheet), w: right(s) - right(sheet) };
      yt = { ...yt, surface: clipped, player: ytPanePlayer(clipped) };
    }
  }

  // Keep the divider clear of the mini player and its handle.
  if (divider && mini) {
    const top = mini.handle.y - 4;
    if (intersects(divider.hit, { ...mini.handle, h: mini.handle.h + mini.rect.h })) {
      divider = {
        line: { ...divider.line, h: Math.max(0, top - divider.line.y) },
        hit: { ...divider.hit, h: Math.max(0, top - divider.hit.y) },
      };
    }
  }

  const panes: PaneBox[] = [];
  for (const index of [0, 1] as PaneIndex[]) {
    const rect = rects[index];
    if (!rect) continue;
    const app = layout.panes[index];
    const id = surfaceIdOf(app);
    const surfaceRect = app.kind === 'youtube' ? yt.surface : rect;
    surfaces[id] = { id, rect: surfaceRect, visible: true, z: app.kind === 'youtube' ? Z_YOUTUBE : Z_SURFACE };
    panes.push({
      index,
      app,
      side: mode === 'single' ? (driverRight ? 'left' : 'right') : index === leftIdx ? 'left' : 'right',
      rect,
      header: { x: rect.x, y: rect.y, w: rect.w, h: L.HEADER },
      fsButton: {
        x: driverRight ? right(rect) - L.FS_BUTTON - L.FS_MARGIN : rect.x + L.FS_MARGIN,
        y: rect.y + L.FS_MARGIN,
        w: L.FS_BUTTON,
        h: L.FS_BUTTON,
      },
      revealStrip: app.kind === 'web' ? { x: rect.x, y: rect.y, w: rect.w, h: L.REVEAL } : null,
    });
  }
  if (mini) surfaces.youtube = { id: 'youtube', rect: mini.rect, visible: true, z: Z_MINI };

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
    usableWidth,
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
