// Mobile / Desktop view by viewport emulation (spec §9.7): render the iframe at layout width L and scale it to fit.
import type { Bookmark, WebViewMode } from '../../features/settings/types';
import { originOf } from './normalizeUrl';

export const MOBILE_WIDTH = 400;
export const MOBILE_MAX_SCALE = 2;
export const ZOOMS = [0.75, 1, 1.25, 1.5] as const;
export const DESKTOP_WIDTHS = [1024, 1280, 1440] as const;
export const AUTO: WebViewMode = { mode: 'auto', zoom: 1 };

export interface ViewBox {
  /** Layout width/height the site sees (iframe CSS size before scaling). */
  width: number;
  height: number;
  scale: number;
  /** Horizontal offset when the scaled page is narrower than the pane (Mobile capped at 2×). */
  offsetX: number;
}

export function viewBox(mode: WebViewMode, paneW: number, paneH: number, desktopWidth: number): ViewBox {
  let width: number;
  let scale: number;
  if (mode.mode === 'mobile') {
    width = MOBILE_WIDTH;
    scale = Math.min(paneW / MOBILE_WIDTH, MOBILE_MAX_SCALE);
  } else if (mode.mode === 'desktop') {
    width = desktopWidth;
    scale = paneW / desktopWidth;
  } else {
    scale = mode.zoom;
    width = paneW / scale;
  }
  if (!(scale > 0) || !Number.isFinite(scale)) scale = 1;
  const w = Math.round(width);
  return { width: w, height: Math.round(paneH / scale), scale, offsetX: Math.max(0, Math.floor((paneW - w * scale) / 2)) };
}

export function sameView(a: WebViewMode, b: WebViewMode): boolean {
  return a.mode === b.mode && (a.mode !== 'auto' || (b.mode === 'auto' && a.zoom === b.zoom));
}

/** The view for a page: its bookmark's choice, else the choice remembered for its origin, else Auto 100 %. */
export function resolveViewMode(url: string, bookmarks: Bookmark[], viewModes: Record<string, WebViewMode>): WebViewMode {
  const bm = bookmarks.find((b) => b.url === url && b.viewMode);
  return bm?.viewMode ?? viewModes[originOf(url)] ?? AUTO;
}
