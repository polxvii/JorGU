// Library data (spec §8.2) through the IndexedDB cache. Client TTLs per the §8.2 table; all ≤ 24 h.
import type { CategoryItem, ChannelItem, FeedResponse, PlaylistItem, VideoItem } from '../../../../shared/ytTypes';
import { useHistory } from '../historyStore';
import { useQueue } from '../queueStore';
import { isChannelId, useSeen } from '../seenStore';
import { useAccount } from './accountStore';
import { api } from './api';
import { type Cached, cached, peek, put } from './cache';
import { type LibraryEntry, normalize } from './libraryIndex';

const MIN = 60_000;
const HOUR = 60 * MIN;
export const TTL = {
  feed: 30 * MIN,
  playlists: HOUR,
  playlistItems: HOUR,
  liked: HOUR,
  popular: HOUR,
  categories: 24 * HOUR,
  subscriptions: 24 * HOUR,
  search: 24 * HOUR,
  video: 6 * HOUR,
};

const list =
  <T>(path: string) =>
  () =>
    api<{ items: T[] }>(path).then((r) => r.items);

/**
 * New from subscriptions. Muted channels (by id) are left out by the Worker, so others take their 40 places; the
 * ones still subscribed come back and are refreshed (kept past 30 days, §III.E.4). Changing mutes doesn't refetch:
 * the list hides them at once, the Worker skips them from the next refresh.
 */
export const loadFeed = (force = false): Promise<Cached<VideoItem[]>> =>
  cached(
    'feed',
    TTL.feed,
    async () => {
      const exclude = Object.keys(useSeen.getState().muted).filter(isChannelId).slice(0, 100);
      const r = await api<FeedResponse>(`/api/yt/feed${exclude.length ? `?exclude=${exclude.join(',')}` : ''}`);
      if (r.muted?.length) useSeen.getState().touch(r.muted);
      return r.items;
    },
    { force },
  );

/** Every subscribed channel (alphabetical, up to 250; 1 unit per 50) for the channel list in New. */
export const loadSubscriptions = (force = false): Promise<Cached<ChannelItem[]>> =>
  cached('subscriptions', TTL.subscriptions, list<ChannelItem>('/api/yt/subscriptions'), { force });

export const loadPlaylists = (force = false): Promise<Cached<PlaylistItem[]>> =>
  cached('playlists', TTL.playlists, list<PlaylistItem>('/api/yt/playlists'), { force });

export const loadPlaylistItems = (id: string, force = false): Promise<Cached<VideoItem[]>> =>
  cached(`pl:${id}`, TTL.playlistItems, list<VideoItem>(`/api/yt/playlist-items?id=${encodeURIComponent(id)}`), { force });

export const loadLiked = (force = false): Promise<Cached<VideoItem[]>> => cached('liked', TTL.liked, list<VideoItem>('/api/yt/liked'), { force });

/** Popular in Thailand; `category` '' = all categories. */
export const loadPopular = (category: string, force = false): Promise<Cached<VideoItem[]>> =>
  cached(`popular:${category || 'all'}`, TTL.popular, list<VideoItem>(`/api/yt/popular${category ? `?category=${category}` : ''}`), { force });

export const loadCategories = (lang: string, force = false): Promise<Cached<CategoryItem[]>> =>
  cached(`categories:${lang}`, TTL.categories, list<CategoryItem>(`/api/yt/categories?lang=${lang}`), { force });

export const loadSearch = (q: string, lang: string): Promise<Cached<VideoItem[]>> =>
  cached(`search:${lang}:${normalize(q)}`, TTL.search, list<VideoItem>(`/api/yt/search?q=${encodeURIComponent(q)}&lang=${lang}`));

/** Everything the library index can see now, from the cache only (no network). */
export async function libraryEntries(): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = [];
  for (const v of (await peek<VideoItem[]>('liked'))?.v ?? []) out.push({ ...v, source: '' });
  for (const p of (await peek<PlaylistItem[]>('playlists'))?.v ?? []) {
    for (const v of (await peek<VideoItem[]>(`pl:${p.id}`))?.v ?? []) out.push({ ...v, source: p.title });
  }
  return out;
}

let warming: Promise<void> | null = null;

/** Loads liked videos and every playlist's items into the cache (nothing is refetched within its TTL). 1 unit/page. */
export function warmLibrary(): Promise<void> {
  warming ??= (async () => {
    try {
      await loadLiked().catch(() => undefined);
      const pls = await loadPlaylists().catch(() => null);
      const queue = [...(pls?.data ?? [])];
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) await loadPlaylistItems(p.id).catch(() => undefined);
      };
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      warming = null;
    }
  })();
  return warming;
}

function applyMeta(v: VideoItem): void {
  useQueue.getState().updateMeta(v.videoId, { title: v.title, channel: v.channel });
  useHistory.getState().updateMeta(v.videoId, { title: v.title, channel: v.channel });
}

/** Titles for queue items added by link (§8.2 videos.list, cached 6 h). Needs a connected account. */
export async function fillTitles(ids: string[]): Promise<void> {
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = await peek<VideoItem>(`v:${id}`);
    if (hit && Date.now() - hit.t < TTL.video) applyMeta(hit.v);
    else missing.push(id);
  }
  if (missing.length === 0 || useAccount.getState().status !== 'connected') return;
  const r = await api<{ items: VideoItem[] }>(`/api/yt/videos?ids=${missing.slice(0, 50).join(',')}`).catch(() => null);
  for (const v of r?.items ?? []) {
    await put(`v:${v.videoId}`, v);
    applyMeta(v);
  }
}

/**
 * Title, channel and length of each id (videos.list, 1 unit per 50, cached 6 h), for Mix clips. Null without an
 * account (the player then supplies each title as it plays).
 */
export async function videoMeta(ids: string[]): Promise<Map<string, VideoItem> | null> {
  const out = new Map<string, VideoItem>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = await peek<VideoItem>(`v:${id}`);
    if (hit && Date.now() - hit.t < TTL.video && hit.v.duration !== undefined) out.set(id, hit.v);
    else missing.push(id);
  }
  if (missing.length && useAccount.getState().status !== 'connected') return out.size ? out : null;
  for (let i = 0; i < missing.length; i += 50) {
    const r = await api<{ items: VideoItem[] }>(`/api/yt/videos?ids=${missing.slice(i, i + 50).join(',')}`);
    for (const v of r.items) {
      out.set(v.videoId, v);
      await put(`v:${v.videoId}`, v);
    }
  }
  return out;
}

export function untitledQueueIds(): string[] {
  return useQueue
    .getState()
    .items.filter((it) => !it.title)
    .map((it) => it.videoId);
}
