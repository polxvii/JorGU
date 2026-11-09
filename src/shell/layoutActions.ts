// Pure reducers for layout assignment (spec §6.1, §6.2, §6.5). Unit-tested; the store calls these.
import type { AppPick, AppRef, LayoutSettings, PaneIndex, WebInstanceId } from '../features/settings/types';
import { clampRatioLoose } from './splitRatio';

const other = (p: PaneIndex): PaneIndex => (p === 0 ? 1 : 0);

function sameApp(a: AppRef, b: AppPick): boolean {
  return a.kind === b.kind && a.kind !== 'web';
}

function freeWebId(panes: [AppRef, AppRef], pane: PaneIndex): WebInstanceId {
  const current = panes[pane];
  if (current.kind === 'web') return current.id;
  const taken = panes[other(pane)];
  return taken.kind === 'web' && taken.id === 'w1' ? 'w2' : 'w1';
}

/** Put an app into a pane. A singleton already in the other pane swaps instead (§6.1). */
export function assignApp(layout: LayoutSettings, pane: PaneIndex, pick: AppPick): LayoutSettings {
  const panes: [AppRef, AppRef] = [layout.panes[0], layout.panes[1]];
  if (pick.kind === 'web') {
    const id = freeWebId(panes, pane);
    const prevUrl = panes[pane].kind === 'web' ? (panes[pane] as { url: string }).url : '';
    panes[pane] = { kind: 'web', id, url: pick.url ?? prevUrl };
    return { ...layout, panes };
  }
  if (sameApp(panes[pane], pick)) return layout;
  if (sameApp(panes[other(pane)], pick)) return swapPanes(layout);
  panes[pane] = { kind: pick.kind };
  return { ...layout, panes };
}

export function swapPanes(layout: LayoutSettings): LayoutSettings {
  return { ...layout, panes: [layout.panes[1], layout.panes[0]] };
}

export function toggleLayoutMode(layout: LayoutSettings): LayoutSettings {
  return { ...layout, mode: layout.mode === 'split' ? 'single' : 'split' };
}

export function setSplitRatio(layout: LayoutSettings, ratio: number): LayoutSettings {
  return { ...layout, splitRatio: clampRatioLoose(ratio) };
}

export function enterFullscreen(layout: LayoutSettings, pane: PaneIndex): LayoutSettings {
  return { ...layout, fullscreenPane: pane, focusedPane: pane };
}

export function exitFullscreen(layout: LayoutSettings): LayoutSettings {
  return { ...layout, fullscreenPane: null };
}

/** ⇄ while full screen: the other pane's app becomes the full-screen app (§6.5). */
export function switchFullscreen(layout: LayoutSettings): LayoutSettings {
  if (layout.fullscreenPane === null) return layout;
  const next = other(layout.fullscreenPane);
  return { ...layout, fullscreenPane: next, focusedPane: next };
}

/** Index of the pane holding YouTube, or null. */
export function youtubePane(layout: LayoutSettings): PaneIndex | null {
  if (layout.panes[0].kind === 'youtube') return 0;
  if (layout.panes[1].kind === 'youtube') return 1;
  return null;
}

const KINDS = new Set(['dashboard', 'map', 'youtube', 'web']);

function validApp(x: unknown): x is AppRef {
  if (!x || typeof x !== 'object') return false;
  const a = x as { kind?: unknown; id?: unknown; url?: unknown };
  if (typeof a.kind !== 'string' || !KINDS.has(a.kind)) return false;
  if (a.kind === 'web') return (a.id === 'w1' || a.id === 'w2') && typeof a.url === 'string';
  return true;
}

/** Repairs a persisted layout: invalid apps, duplicate singletons, duplicate web ids, out-of-range values. */
export function sanitizeLayout(input: Partial<LayoutSettings> | undefined, fallback: LayoutSettings): LayoutSettings {
  const l = { ...fallback, ...(input ?? {}) } as LayoutSettings;
  let panes: [AppRef, AppRef] = Array.isArray(l.panes) && l.panes.length === 2 && validApp(l.panes[0]) && validApp(l.panes[1])
    ? [l.panes[0], l.panes[1]]
    : fallback.panes;
  const [a, b] = panes;
  if (a.kind === b.kind && a.kind !== 'web') panes = fallback.panes;
  if (a.kind === 'web' && b.kind === 'web' && a.id === b.id) panes = [a, { ...b, id: a.id === 'w1' ? 'w2' : 'w1' }];
  const pane = (p: unknown, d: PaneIndex | null) => (p === 0 || p === 1 ? p : d);
  return {
    mode: l.mode === 'single' ? 'single' : 'split',
    splitRatio: typeof l.splitRatio === 'number' && Number.isFinite(l.splitRatio) ? clampRatioLoose(l.splitRatio) : fallback.splitRatio,
    panes,
    focusedPane: pane(l.focusedPane, fallback.focusedPane) as PaneIndex,
    fullscreenPane: pane(l.fullscreenPane, null),
    driverSide: l.driverSide === 'left' ? 'left' : 'right',
  };
}
