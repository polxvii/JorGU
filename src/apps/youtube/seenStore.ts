// What JorGu remembers about clips on this device (user 2026-11-15: lists kept showing clips already played, and
// channels they don't care about). YouTube's own watch history can't be read or written from JorGu (spec §3.1,
// §3.3), so JorGu keeps its own: clips played here, clips hidden with the "Hide" button, and muted channels.
// Video and channel ids are API data: kept at most 30 days (YouTube API Services Developer Policies §III.E.4).
// A muted channel is refreshed whenever a fresh New list confirms it's still subscribed.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const SEEN_MAX_AGE_MS = 30 * 24 * 3600_000;
export const SEEN_MAX_IDS = 3000;

export interface PlayedEntry {
  at: number;
  /** Channel title, to rank New by the channels played most. */
  ch?: string;
}

export interface MutedChannel {
  title: string;
  at: number;
}

interface SeenState {
  played: Record<string, PlayedEntry>;
  hidden: Record<string, number>;
  /** Key: the channel id (UC…), or its title when the id isn't known (lists cached before ids were kept). */
  muted: Record<string, MutedChannel>;
  markPlayed: (videoId: string, channel?: string, now?: number) => void;
  /** Undo a mark (✓ on a list row tapped again, or the toast's Undo). */
  unmarkPlayed: (videoId: string) => void;
  hide: (videoId: string, now?: number) => void;
  unhide: (videoId: string) => void;
  mute: (key: string, title: string, now?: number) => void;
  unmute: (key: string) => void;
  /** Muted channels seen in a fresh API response: their 30 days start again. */
  touch: (channels: { channelId: string; title: string }[], now?: number) => void;
  prune: (now?: number) => void;
  /** Forget played and hidden clips (Settings). Muted channels stay. */
  forgetClips: () => void;
}

/** Newest `max` entries younger than 30 days. */
function trim<T>(rec: Record<string, T>, at: (v: T) => number, now: number, max = SEEN_MAX_IDS): Record<string, T> {
  const fresh = Object.entries(rec).filter(([, v]) => now - at(v) <= SEEN_MAX_AGE_MS);
  if (fresh.length > max) fresh.sort((a, b) => at(b[1]) - at(a[1])).splice(max);
  return Object.fromEntries(fresh);
}

export const useSeen = create<SeenState>()(
  persist(
    (set) => ({
      played: {},
      hidden: {},
      muted: {},
      markPlayed: (videoId, channel, now = Date.now()) =>
        set((s) => ({ played: trim({ ...s.played, [videoId]: { at: now, ...(channel ? { ch: channel } : {}) } }, (v) => v.at, now) })),
      unmarkPlayed: (videoId) =>
        set((s) => {
          const played = { ...s.played };
          delete played[videoId];
          return { played };
        }),
      hide: (videoId, now = Date.now()) => set((s) => ({ hidden: trim({ ...s.hidden, [videoId]: now }, (v) => v, now) })),
      unhide: (videoId) =>
        set((s) => {
          const hidden = { ...s.hidden };
          delete hidden[videoId];
          return { hidden };
        }),
      mute: (key, title, now = Date.now()) => set((s) => ({ muted: { ...s.muted, [key]: { title, at: now } } })),
      unmute: (key) =>
        set((s) => {
          const muted = { ...s.muted };
          delete muted[key];
          return { muted };
        }),
      touch: (channels, now = Date.now()) =>
        set((s) => {
          const muted = { ...s.muted };
          for (const c of channels) if (muted[c.channelId]) muted[c.channelId] = { title: c.title || muted[c.channelId].title, at: now };
          return { muted };
        }),
      prune: (now = Date.now()) =>
        set((s) => ({
          played: trim(s.played, (v) => v.at, now),
          hidden: trim(s.hidden, (v) => v, now),
          muted: trim(s.muted, (v) => v.at, now),
        })),
      forgetClips: () => set({ played: {}, hidden: {} }),
    }),
    { name: 'jorgu:seen', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

export type SkipReason = 'played' | 'hidden' | 'muted';

export interface SeenView {
  played: Record<string, PlayedEntry>;
  hidden: Record<string, number>;
  muted: Record<string, MutedChannel>;
}

export const isChannelId = (key: string) => /^UC[A-Za-z0-9_-]{22}$/.test(key);

/** Key a channel is muted under: its id when known, else its title. */
export const channelKey = (v: { channel?: string; channelId?: string }) => v.channelId || v.channel || '';

export function isMuted(v: { channel?: string; channelId?: string }, s: Pick<SeenView, 'muted'>): boolean {
  return (!!v.channelId && !!s.muted[v.channelId]) || (!!v.channel && !!s.muted[v.channel]);
}

/** Why a clip is left out of New and Trending; null = show it. `hidePlayed` = Settings switch. */
export function skipReason(v: { videoId: string; channel?: string; channelId?: string }, s: SeenView, hidePlayed: boolean): SkipReason | null {
  if (s.hidden[v.videoId]) return 'hidden';
  if (isMuted(v, s)) return 'muted';
  if (hidePlayed && s.played[v.videoId]) return 'played';
  return null;
}

/** How many different clips of each channel (by title) were played in the last 30 days. */
export function channelPlays(played: Record<string, PlayedEntry>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of Object.values(played)) if (e.ch) out.set(e.ch, (out.get(e.ch) ?? 0) + 1);
  return out;
}
