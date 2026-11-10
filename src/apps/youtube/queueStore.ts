// Play queue (spec §8.5): {items, index, repeat, shuffle} persisted in localStorage.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface QueueItem {
  key: string;
  videoId: string;
  title?: string;
  channel?: string;
  start?: number;
}

export type Repeat = 'off' | 'all' | 'one';

export interface QueueData {
  items: QueueItem[];
  index: number;
  repeat: Repeat;
  shuffle: boolean;
  /** Play order (indexes into items). Identity unless shuffle is on. */
  order: number[];
}

let keySeq = 0;
export function makeItem(videoId: string, meta: Partial<Omit<QueueItem, 'key' | 'videoId'>> = {}): QueueItem {
  keySeq += 1;
  return { key: `${Date.now().toString(36)}-${keySeq}`, videoId, ...meta };
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function shuffledOrder(n: number, first: number, rand: () => number = Math.random): number[] {
  const rest = identity(n).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 && first < n ? [first, ...rest] : rest;
}

export function rebuildOrder(q: Pick<QueueData, 'items' | 'index' | 'shuffle'>, rand?: () => number): number[] {
  return q.shuffle ? shuffledOrder(q.items.length, q.index, rand) : identity(q.items.length);
}

/** Index to play after the current one, or null at the end. `manual` = user pressed Next (repeat-one is ignored). */
export function nextIndex(q: QueueData, manual = false): number | null {
  if (q.items.length === 0) return null;
  if (q.repeat === 'one' && !manual) return q.index;
  const p = q.order.indexOf(q.index);
  if (p >= 0 && p < q.order.length - 1) return q.order[p + 1];
  if (q.repeat === 'all' || (manual && q.repeat === 'one')) return q.order[0] ?? null;
  return null;
}

export function prevIndex(q: QueueData): number | null {
  if (q.items.length === 0) return null;
  const p = q.order.indexOf(q.index);
  if (p > 0) return q.order[p - 1];
  return q.repeat === 'all' ? q.order[q.order.length - 1] : null;
}

interface QueueActions {
  playNow: (items: QueueItem[], start?: number) => void;
  addToEnd: (items: QueueItem[]) => void;
  addNext: (item: QueueItem) => void;
  jump: (index: number) => void;
  remove: (index: number) => void;
  setRepeat: (repeat: Repeat) => void;
  toggleShuffle: () => void;
  updateMeta: (videoId: string, meta: Partial<Pick<QueueItem, 'title' | 'channel'>>) => void;
  clear: () => void;
}

export type QueueState = QueueData & QueueActions;

const EMPTY: QueueData = { items: [], index: 0, repeat: 'off', shuffle: false, order: [] };

export const useQueue = create<QueueState>()(
  persist(
    (set) => ({
      ...EMPTY,
      playNow: (items, start = 0) =>
        set((s) => {
          const index = Math.min(Math.max(0, start), Math.max(0, items.length - 1));
          return { items, index, order: rebuildOrder({ items, index, shuffle: s.shuffle }) };
        }),
      addToEnd: (add) =>
        set((s) => {
          const items = [...s.items, ...add];
          return { items, order: s.shuffle ? [...s.order, ...add.map((_, i) => s.items.length + i)] : identity(items.length) };
        }),
      addNext: (item) =>
        set((s) => {
          if (s.items.length === 0) return { items: [item], index: 0, order: [0] };
          const at = s.index + 1;
          const items = [...s.items.slice(0, at), item, ...s.items.slice(at)];
          const shifted = s.order.map((i) => (i >= at ? i + 1 : i));
          const p = shifted.indexOf(s.index);
          const order = s.shuffle ? [...shifted.slice(0, p + 1), at, ...shifted.slice(p + 1)] : identity(items.length);
          return { items, order };
        }),
      jump: (index) => set((s) => (index >= 0 && index < s.items.length ? { index } : s)),
      remove: (index) =>
        set((s) => {
          if (index < 0 || index >= s.items.length) return s;
          const items = s.items.filter((_, i) => i !== index);
          const newIndex = index < s.index ? s.index - 1 : Math.min(s.index, Math.max(0, items.length - 1));
          const order = s.order.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
          return { items, index: newIndex, order: s.shuffle ? order : identity(items.length) };
        }),
      setRepeat: (repeat) => set({ repeat }),
      toggleShuffle: () =>
        set((s) => {
          const shuffle = !s.shuffle;
          return { shuffle, order: rebuildOrder({ items: s.items, index: s.index, shuffle }) };
        }),
      updateMeta: (videoId, meta) =>
        set((s) => ({ items: s.items.map((it) => (it.videoId === videoId ? { ...it, ...meta } : it)) })),
      clear: () => set({ ...EMPTY }),
    }),
    {
      name: 'jorgu:queue',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ items, index, repeat, shuffle, order }) => ({ items, index, repeat, shuffle, order }),
    },
  ),
);

export function currentItem(q: QueueData): QueueItem | null {
  return q.items[q.index] ?? null;
}
