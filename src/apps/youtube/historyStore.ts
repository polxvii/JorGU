// "Recently" (user request 2026-11-11): videos played in JorGu on this device. The Data API's watch history is empty
// since 2016 (spec §3.3), so JorGu keeps its own. Titles are API data: entries older than 30 days are dropped
// (YouTube API Services Developer Policies §III.E.4).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface HistoryEntry {
  videoId: string;
  title?: string;
  channel?: string;
  /** Last played (ms). */
  at: number;
}

export const HISTORY_MAX = 100;
export const HISTORY_MAX_AGE_MS = 30 * 24 * 3600_000;

interface HistoryState {
  entries: HistoryEntry[];
  record: (e: Omit<HistoryEntry, 'at'>, now?: number) => void;
  updateMeta: (videoId: string, meta: Pick<HistoryEntry, 'title' | 'channel'>) => void;
  prune: (now?: number) => void;
  clear: () => void;
}

const fresh = (list: HistoryEntry[], now: number) => list.filter((e) => now - e.at <= HISTORY_MAX_AGE_MS);

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      record: (e, now = Date.now()) =>
        set((s) => {
          const old = s.entries.find((x) => x.videoId === e.videoId);
          const entry: HistoryEntry = { ...old, ...e, title: e.title ?? old?.title, channel: e.channel ?? old?.channel, at: now };
          return { entries: fresh([entry, ...s.entries.filter((x) => x.videoId !== e.videoId)], now).slice(0, HISTORY_MAX) };
        }),
      updateMeta: (videoId, meta) =>
        set((s) => (s.entries.some((x) => x.videoId === videoId) ? { entries: s.entries.map((x) => (x.videoId === videoId ? { ...x, ...meta } : x)) } : s)),
      prune: (now = Date.now()) => set((s) => ({ entries: fresh(s.entries, now) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'jorgu:history', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
