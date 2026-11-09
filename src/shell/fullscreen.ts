// Per-pane full screen (spec §6.5): layer 1 = in-app CSS, layer 2 = browser Fullscreen API on the app root.
// Exits: ✕ / Esc / Back / browser leaving full screen. All paths go through exitFullscreen() so states never disagree.
import { useEffect } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { PaneIndex } from '../features/settings/types';

const HISTORY_MARK = 'jorguFullscreen';

type DocWithWebkit = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type ElWithWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as DocWithWebkit;
const browserFullscreenElement = () => doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

function browserFullscreenAvailable(): boolean {
  const d = doc();
  if (!(d.fullscreenEnabled ?? d.webkitFullscreenEnabled)) return false;
  if (matchMedia('(display-mode: fullscreen)').matches) return false; // installed PWA already full screen
  return !browserFullscreenElement();
}

function requestBrowserFullscreen(): void {
  if (!browserFullscreenAvailable()) return;
  const root = document.documentElement as ElWithWebkit;
  try {
    const p = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* layer 2 is best-effort */
  }
}

function exitBrowserFullscreen(): void {
  if (!browserFullscreenElement()) return;
  try {
    const d = doc();
    const p = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

function pushHistoryEntry(): void {
  if (!(history.state && history.state[HISTORY_MARK])) history.pushState({ [HISTORY_MARK]: true }, '');
}

/** Enter full screen for a pane. `gesture` = called from a tap handler (required for layer 2). */
export function enterFullscreen(pane: PaneIndex, opts: { gesture: boolean } = { gesture: true }): void {
  const s = useSettings.getState();
  if (s.layout.fullscreenPane !== null) return;
  s.enterFullscreen(pane);
  useUi.getState().setNeedsHistoryEntry(false);
  pushHistoryEntry();
  if (opts.gesture) requestBrowserFullscreen();
}

let poppingOwnEntry = false;

export type ExitSource = 'button' | 'esc' | 'popstate' | 'browser' | 'voice';

export function exitFullscreen(source: ExitSource): void {
  const s = useSettings.getState();
  if (s.layout.fullscreenPane === null) return;
  s.exitFullscreen();
  useUi.getState().hideFloating();
  useUi.getState().setNeedsHistoryEntry(false);
  exitBrowserFullscreen();
  if (source !== 'popstate' && history.state && history.state[HISTORY_MARK]) {
    poppingOwnEntry = true;
    history.back();
  }
}

export function switchFullscreen(): void {
  useSettings.getState().switchFullscreen();
}

/** Installs Back / Esc / fullscreenchange handling. Mount once in App. */
export function useFullscreenController(): void {
  useEffect(() => {
    // Restored from storage: Chrome skips history entries created without a user gesture,
    // so the Back entry is pushed on the first touch instead.
    if (useSettings.getState().layout.fullscreenPane !== null && !(history.state && history.state[HISTORY_MARK])) {
      useUi.getState().setNeedsHistoryEntry(true);
    }

    const onPop = () => {
      if (poppingOwnEntry) {
        poppingOwnEntry = false;
        return;
      }
      exitFullscreen('popstate');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useSettings.getState().layout.fullscreenPane !== null) {
        e.preventDefault();
        exitFullscreen('esc');
      }
    };
    let wasBrowserFs = !!browserFullscreenElement();
    const onFsChange = () => {
      const now = !!browserFullscreenElement();
      if (wasBrowserFs && !now) exitFullscreen('browser');
      wasBrowserFs = now;
    };
    const onFirstTouch = () => {
      const ui = useUi.getState();
      if (ui.needsHistoryEntry && useSettings.getState().layout.fullscreenPane !== null) {
        pushHistoryEntry();
        ui.setNeedsHistoryEntry(false);
      }
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('pointerdown', onFirstTouch, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.removeEventListener('pointerdown', onFirstTouch, true);
    };
  }, []);
}
