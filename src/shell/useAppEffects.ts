// App-wide side effects: theme + night mode, language attribute, online state, header auto-hide,
// focus tracking for iframe taps, and the mini-player "sticky" state.
import { useEffect } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { PaneIndex } from '../features/settings/types';
import { surfaceIdOf } from '../features/settings/types';
import { applyTheme, isNightTime } from '../theme/themes';
import type { LayoutResult } from './computeLayout';

const HEADER_HIDE_MS = 4000;

export function useAppEffects(layout: LayoutResult): void {
  const themeId = useSettings((s) => s.themeId);
  const night = useSettings((s) => s.nightMode);
  const language = useSettings((s) => s.language);
  const isNight = useUi((s) => s.isNight);
  const headersVisible = useUi((s) => s.headersVisible);
  const headersNonce = useUi((s) => s.headersNonce);
  const drag = useUi((s) => s.drag);
  const playing = useUi((s) => s.youtube.playing);
  const ytMode = layout.youtube.mode;

  // Theme and night mode (spec §12.2).
  useEffect(() => applyTheme(themeId, isNight), [themeId, isNight]);
  useEffect(() => {
    const check = () => useUi.getState().setNight(night.auto && isNightTime(new Date(), night.start, night.end));
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [night.auto, night.start, night.end]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Online / offline banner (spec §14).
  useEffect(() => {
    const on = () => useUi.getState().setOnline(true);
    const off = () => useUi.getState().setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Any touch on our own UI shows the pane headers; they hide after 4 s without touches (spec §6.2).
  useEffect(() => {
    const onDown = () => useUi.getState().showHeaders();
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => {
    if (!headersVisible || drag) return;
    const id = window.setTimeout(() => useUi.getState().hideHeaders(), HEADER_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [headersVisible, headersNonce, drag]);

  // Taps inside cross-origin iframes never reach us; the window blurs and the iframe becomes activeElement.
  useEffect(() => {
    const onBlur = () => {
      window.setTimeout(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLIFrameElement)) return;
        const surface = el.closest<HTMLElement>('[data-surface]')?.dataset.surface;
        const { layout: l, setFocusedPane } = useSettings.getState();
        const pane = ([0, 1] as PaneIndex[]).find((p) => surfaceIdOf(l.panes[p]) === surface);
        if (pane !== undefined) setFocusedPane(pane);
        if (l.fullscreenPane !== null && surface?.startsWith('web:')) return;
        useUi.getState().showHeaders();
      }, 0);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // Mini player stays after a pause until dismissed; cleared when YouTube is back in a pane (spec §6.6).
  useEffect(() => {
    const ui = useUi.getState();
    if (ytMode === 'mini' && playing && !ui.youtube.miniSticky) ui.setYoutube({ miniSticky: true });
    if ((ytMode === 'pane' || ytMode === 'fullscreen') && ui.youtube.miniSticky) ui.setYoutube({ miniSticky: false });
  }, [ytMode, playing]);
}
