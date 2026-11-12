import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { withRecentDestination } from '../../apps/map/navigate';
import * as W from '../../apps/web/webActions';
import * as A from '../../shell/layoutActions';
import { mergeSettings } from './merge';
import type {
  AppPick, Bookmark, DockSize, DriverSide, Language, MiniCorner, MiniPlayerSize, PaneIndex, Settings, SplitDirection, ThemeId, WebInstanceId, WebViewMode,
} from './types';
import { defaultSettings } from './types';

export const SETTINGS_KEY = 'jorgu:settings';
/** 2: traffic on by default; 3: route on the live map by default (user requests 2026-11-11). */
export const SETTINGS_VERSION = 3;

export interface SettingsActions {
  setLanguage: (language: Language) => void;
  setTheme: (themeId: ThemeId) => void;
  setNightMode: (patch: Partial<Settings['nightMode']>) => void;
  setDriverSide: (side: DriverSide) => void;
  setDirection: (direction: SplitDirection) => void;
  setMiniPlayerSize: (size: MiniPlayerSize) => void;
  setMiniCorner: (corner: MiniCorner) => void;
  setAutoContinue: (on: boolean) => void;
  setDockSize: (size: DockSize) => void;
  setMapMode: (mode: Settings['map']['mode']) => void;
  setRouteLine: (on: boolean) => void;
  setMapFollow: (on: boolean) => void;
  setMapTraffic: (on: boolean) => void;
  setMapAvoid: (what: 'avoidTolls' | 'avoidHighways', on: boolean) => void;
  setRouteInfoAt: (at: 'top' | 'bottom') => void;
  addSavedPlace: (label: string, query: string) => void;
  removeSavedPlace: (id: string) => void;
  addRecentDestination: (destination: string) => void;
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
  togglePinUrl: (url: string) => void;
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
    language, themeId, nightMode, layout, map, web, youtube, dockSize, library, playbackLoginCheck,
  } = s;
  return { language, themeId, nightMode, layout, map, web, youtube, dockSize, library, playbackLoginCheck };
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
      setMiniCorner: (miniCorner) => set((s) => ({ youtube: { ...s.youtube, miniCorner } })),
      setAutoContinue: (autoContinue) => set((s) => ({ youtube: { ...s.youtube, autoContinue } })),
      setDockSize: (dockSize) => set({ dockSize }),
      setMapMode: (mode) => set((s) => ({ map: { ...s.map, mode } })),
      setRouteLine: (routeLine) => set((s) => ({ map: { ...s.map, routeLine } })),
      setMapFollow: (follow) => set((s) => ({ map: { ...s.map, follow } })),
      setMapTraffic: (traffic) => set((s) => ({ map: { ...s.map, traffic } })),
      setMapAvoid: (what, on) => set((s) => ({ map: { ...s.map, [what]: on } })),
      setRouteInfoAt: (routeInfoAt) => set((s) => ({ map: { ...s.map, routeInfoAt } })),
      addSavedPlace: (label, query) =>
        set((s) => ({
          map: {
            ...s.map,
            savedPlaces: [...s.map.savedPlaces, { id: `pl-${Date.now().toString(36)}`, label: label.trim() || query.trim(), query: query.trim(), source: 'manual' }],
          },
        })),
      removeSavedPlace: (id) => set((s) => ({ map: { ...s.map, savedPlaces: s.map.savedPlaces.filter((p) => p.id !== id) } })),
      addRecentDestination: (d) => set((s) => ({ map: { ...s.map, recentDestinations: withRecentDestination(s.map.recentDestinations, d) } })),
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
      togglePinUrl: (url) => set((s) => ({ web: W.togglePinUrl(s.web, url) })),
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
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<Settings>;
        // v1 saved traffic: false only because it was the default; the user asked to see traffic.
        if (!s.map) return s as Settings;
        const map = { ...s.map };
        if (version < 2) map.traffic = true;
        if (version < 3) map.routeLine = true;
        return { ...s, map } as Settings;
      },
    },
  ),
);
