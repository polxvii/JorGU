// Transient UI state (not persisted).
import { create } from 'zustand';
import type { MessageKey } from '../../i18n/en';
import type { PaneIndex, SurfaceId } from './types';

export type SheetState =
  | null
  | { kind: 'picker'; pane: PaneIndex }
  | { kind: 'settings' }
  | { kind: 'library'; tab?: LibraryTab }
  | { kind: 'queue' }
  | { kind: 'web'; pane: PaneIndex };

export type LibraryTab = 'paste' | 'feed' | 'playlists' | 'trending' | 'search';

export interface Toast {
  id: number;
  message: MessageKey;
  params?: Record<string, string | number>;
  action?: { label: MessageKey; href: string };
}

export interface UiState {
  sheet: SheetState;
  /** Last library tab (null until first opened). */
  libraryTab: LibraryTab | null;
  /** Category chosen on the Trending tab ('' = all). */
  chartCategory: string;
  headersVisible: boolean;
  /** Bumped on every touch so auto-hide timers restart. */
  headersNonce: number;
  floatingVisible: boolean;
  floatingNonce: number;
  drag: null | { from: PaneIndex; over: PaneIndex | null };
  /** M1: playback is simulated by the YouTube placeholder; M2 wires the real player. */
  youtube: { playing: boolean; miniSticky: boolean; mode: 'pane' | 'mini' | 'fullscreen' | 'hidden' };
  toasts: Toast[];
  mounted: SurfaceId[];
  online: boolean;
  updateSW: null | (() => void);
  isNight: boolean;
  /** Full screen was restored from storage; push a history entry on the first touch (Chrome skips gesture-less entries). */
  needsHistoryEntry: boolean;

  openSheet: (sheet: Exclude<SheetState, null>) => void;
  closeSheet: () => void;
  setLibraryTab: (tab: LibraryTab) => void;
  setChartCategory: (id: string) => void;
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
  showToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const TOAST_MS = 6000;
let toastSeq = 0;

export const useUi = create<UiState>()((set) => ({
  sheet: null,
  libraryTab: null,
  chartCategory: '',
  headersVisible: true,
  headersNonce: 0,
  floatingVisible: false,
  floatingNonce: 0,
  drag: null,
  youtube: { playing: false, miniSticky: false, mode: 'hidden' },
  toasts: [],
  mounted: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  updateSW: null,
  isNight: false,
  needsHistoryEntry: false,

  openSheet: (sheet) =>
    set({ sheet, floatingVisible: false, ...(sheet.kind === 'library' && sheet.tab ? { libraryTab: sheet.tab } : {}) }),
  closeSheet: () => set({ sheet: null }),
  setLibraryTab: (libraryTab) => set({ libraryTab }),
  setChartCategory: (chartCategory) => set({ chartCategory }),
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
  showToast: (t) => {
    toastSeq += 1;
    const id = toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    window.setTimeout(() => useUi.getState().dismissToast(id), TOAST_MS);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
