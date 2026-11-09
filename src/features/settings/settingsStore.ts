import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as A from '../../shell/layoutActions';
import { mergeSettings } from './merge';
import type { AppPick, DriverSide, Language, MiniPlayerSize, PaneIndex, Settings, ThemeId } from './types';
import { defaultSettings } from './types';

export const SETTINGS_KEY = 'jorgu:settings';
export const SETTINGS_VERSION = 1;

export interface SettingsActions {
  setLanguage: (language: Language) => void;
  setTheme: (themeId: ThemeId) => void;
  setNightMode: (patch: Partial<Settings['nightMode']>) => void;
  setDriverSide: (side: DriverSide) => void;
  setMiniPlayerSize: (size: MiniPlayerSize) => void;
  assign: (pane: PaneIndex, pick: AppPick) => void;
  swap: () => void;
  toggleLayoutMode: () => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedPane: (pane: PaneIndex) => void;
  enterFullscreen: (pane: PaneIndex) => void;
  exitFullscreen: () => void;
  switchFullscreen: () => void;
  reset: () => void;
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
      setMiniPlayerSize: (miniPlayerSize) => set({ youtube: { miniPlayerSize } }),
      assign: (pane, pick) => set((s) => ({ layout: A.assignApp(s.layout, pane, pick) })),
      swap: () => set((s) => ({ layout: A.swapPanes(s.layout) })),
      toggleLayoutMode: () => set((s) => ({ layout: A.toggleLayoutMode(s.layout) })),
      setSplitRatio: (ratio) => set((s) => ({ layout: A.setSplitRatio(s.layout, ratio) })),
      setFocusedPane: (focusedPane) =>
        set((s) => (s.layout.focusedPane === focusedPane ? s : { layout: { ...s.layout, focusedPane } })),
      enterFullscreen: (pane) => set((s) => ({ layout: A.enterFullscreen(s.layout, pane) })),
      exitFullscreen: () => set((s) => ({ layout: A.exitFullscreen(s.layout) })),
      switchFullscreen: () => set((s) => ({ layout: A.switchFullscreen(s.layout) })),
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
