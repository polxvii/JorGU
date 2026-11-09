// Transient UI state (not persisted).
import { create } from 'zustand';
import type { PaneIndex, SurfaceId } from './types';

export type SheetState = null | { kind: 'picker'; pane: PaneIndex } | { kind: 'settings' };

export interface UiState {
  sheet: SheetState;
  headersVisible: boolean;
  /** Bumped on every touch so auto-hide timers restart. */
  headersNonce: number;
  floatingVisible: boolean;
  floatingNonce: number;
  drag: null | { from: PaneIndex; over: PaneIndex | null };
  /** M1: playback is simulated by the YouTube placeholder; M2 wires the real player. */
  youtube: { playing: boolean; miniSticky: boolean };
  mounted: SurfaceId[];
  online: boolean;
  updateSW: null | (() => void);
  isNight: boolean;
  /** Full screen was restored from storage; push a history entry on the first touch (Chrome skips gesture-less entries). */
  needsHistoryEntry: boolean;

  openSheet: (sheet: Exclude<SheetState, null>) => void;
  closeSheet: () => void;
  showHeaders: () => void;
  hideHeaders: () => void;
  showFloating: () => void;
  hideFloating: () => void;
  setDrag: (drag: UiState['drag']) => void;
  setYoutube: (patch: Partial<UiState['youtube']>) => void;
  mount: (ids: SurfaceId[]) => void;
  setOnline: (online: boolean) => void;
  setUpdateSW: (fn: (() => void) | null) => void;
  setNight: (isNight: boolean) => void;
  setNeedsHistoryEntry: (v: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  sheet: null,
  headersVisible: true,
  headersNonce: 0,
  floatingVisible: false,
  floatingNonce: 0,
  drag: null,
  youtube: { playing: false, miniSticky: false },
  mounted: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  updateSW: null,
  isNight: false,
  needsHistoryEntry: false,

  openSheet: (sheet) => set({ sheet, floatingVisible: false }),
  closeSheet: () => set({ sheet: null }),
  showHeaders: () => set((s) => ({ headersVisible: true, headersNonce: s.headersNonce + 1 })),
  hideHeaders: () => set((s) => (s.headersVisible ? { headersVisible: false } : s)),
  showFloating: () => set((s) => ({ floatingVisible: true, floatingNonce: s.floatingNonce + 1 })),
  hideFloating: () => set((s) => (s.floatingVisible ? { floatingVisible: false } : s)),
  setDrag: (drag) => set({ drag }),
  setYoutube: (patch) => set((s) => ({ youtube: { ...s.youtube, ...patch } })),
  mount: (ids) =>
    set((s) => {
      const add = ids.filter((id) => !s.mounted.includes(id));
      return add.length ? { mounted: [...s.mounted, ...add] } : s;
    }),
  setOnline: (online) => set({ online }),
  setUpdateSW: (updateSW) => set({ updateSW }),
  setNight: (isNight) => set((s) => (s.isNight === isNight ? s : { isNight })),
  setNeedsHistoryEntry: (needsHistoryEntry) => set({ needsHistoryEntry }),
}));
