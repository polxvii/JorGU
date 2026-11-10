import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as W from '../../apps/web/webActions';
import * as A from '../../shell/layoutActions';
import { mergeSettings } from './merge';
import type {
  AppPick, Bookmark, DriverSide, Language, MiniPlayerSize, PaneIndex, Settings, SplitDirection, ThemeId, WebInstanceId, WebViewMode,
} from './types';
import { defaultSettings } from './types';

export const SETTINGS_KEY = 'jorgu:settings';
export const SETTINGS_VERSION = 1;

export interface SettingsActions {
  setLanguage: (language: Language) => void;
  setTheme: (themeId: ThemeId) => void;
  setNightMode: (patch: Partial<Settings['nightMode']>) => void;
  setDriverSide: (side: DriverSide) => void;
  setDirection: (direction: SplitDirection) => void;
  setMiniPlayerSize: (size: MiniPlayerSize) => void;
  setPlaybackRate: (rate: number) => void;
  assign: (pane: PaneIndex, pick: AppPick) => void;
  swap: () => void;
  toggleLayoutMode: () => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedPane: (pane: PaneIndex) => void;
  enterFullscreen: (pane: PaneIndex) => void;
  exitFullscreen: () => void;
  switchFullscreen: () => void;
  /** Open `url` in web instance `id` ('' = start page); non-empty URLs go to Recent. */
  setWebUrl: (id: WebInstanceId, url: string) => void;
  addBookmark: (url: string, title?: string) => void;
  updateBookmark: (id: string, patch: Partial<Pick<Bookmark, 'title' | 'pinned'>>) => void;
  removeBookmark: (id: string) => void;
  setViewMode: (url: string, mode: WebViewMode) => void;
  setDesktopWidth: (width: Settings['web']['desktopWidth']) => void;
  reset: () => void;
}

/** Last page per web instance this session, so picking "Web" again resumes it. */
const lastUrls: Partial<Record<WebInstanceId, string>> = {};
function rememberWebUrls(panes: Settings['layout']['panes']): void {
  for (const p of panes) if (p.kind === 'web') lastUrls[p.id] = p.url;
}

export type SettingsState = Settings & SettingsActions;

function settingsOnly(s: SettingsState): Settings {
  const {
    language, themeId, nightMode, layout, map, web, youtube, alerts, library, voice, clock, playbackLoginCheck,
  } = s;
  return { language, themeId, nightMode, layout, map, web, youtube, alerts, library, voice, clock, playbackLoginCheck };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setLanguage: (language) => set({ language }),
      setTheme: (themeId) => set({ themeId }),
      setNightMode: (patch) => set((s) => ({ nightMode: { ...s.nightMode, ...patch } })),
      setDriverSide: (driverSide) => set((s) => ({ layout: { ...s.layout, driverSide } })),
      setDirection: (direction) => set((s) => ({ layout: { ...s.layout, direction } })),
      setMiniPlayerSize: (miniPlayerSize) => set((s) => ({ youtube: { ...s.youtube, miniPlayerSize } })),
      setPlaybackRate: (playbackRate) => set((s) => ({ youtube: { ...s.youtube, playbackRate } })),
      assign: (pane, pick) =>
        set((s) => {
          rememberWebUrls(s.layout.panes);
          const layout = A.assignApp(s.layout, pane, pick, lastUrls);
          const opened = pick.kind === 'web' && pick.url ? W.withRecent(s.web.recent, pick.url) : null;
          return opened ? { layout, web: { ...s.web, recent: opened } } : { layout };
        }),
      swap: () => set((s) => ({ layout: A.swapPanes(s.layout) })),
      toggleLayoutMode: () => set((s) => ({ layout: A.toggleLayoutMode(s.layout) })),
      setSplitRatio: (ratio) => set((s) => ({ layout: A.setSplitRatio(s.layout, ratio) })),
      setFocusedPane: (focusedPane) =>
        set((s) => (s.layout.focusedPane === focusedPane ? s : { layout: { ...s.layout, focusedPane } })),
      enterFullscreen: (pane) => set((s) => ({ layout: A.enterFullscreen(s.layout, pane) })),
      exitFullscreen: () => set((s) => ({ layout: A.exitFullscreen(s.layout) })),
      switchFullscreen: () => set((s) => ({ layout: A.switchFullscreen(s.layout) })),
      setWebUrl: (id, url) =>
        set((s) => ({
          layout: W.setPaneUrl(s.layout, id, url),
          ...(url ? { web: { ...s.web, recent: W.withRecent(s.web.recent, url) } } : {}),
        })),
      addBookmark: (url, title) =>
        set((s) => ({ web: W.addBookmark(s.web, url, title) })),
      updateBookmark: (id, patch) => set((s) => ({ web: W.updateBookmark(s.web, id, patch) })),
      removeBookmark: (id) => set((s) => ({ web: W.removeBookmark(s.web, id) })),
      setViewMode: (url, mode) => set((s) => ({ web: W.setViewModeFor(s.web, url, mode) })),
      setDesktopWidth: (desktopWidth) => set((s) => ({ web: { ...s.web, desktopWidth } })),
      reset: () => set(defaultSettings()),
    }),
    {
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: settingsOnly,
      merge: (persisted, current) => ({ ...current, ...mergeSettings(persisted, settingsOnly(current)) }),
      migrate: (persisted) => persisted as Settings,
    },
  ),
);
