// Library data (spec §8.2) through the IndexedDB cache. Client TTLs per the §8.2 table; all ≤ 24 h.
import type { PlaylistItem, VideoItem } from '../../../../shared/ytTypes';
import { useQueue } from '../queueStore';
import { useAccount } from './accountStore';
import { api } from './api';
import { type Cached, cached, peek, put } from './cache';
import { type LibraryEntry, normalize } from './libraryIndex';

const MIN = 60_000;
const HOUR = 60 * MIN;
export const TTL = { feed: 30 * MIN, playlists: HOUR, playlistItems: HOUR, liked: HOUR, popular: HOUR, search: 24 * HOUR, video: 6 * HOUR };

const list =
  <T>(path: string) =>
  () =>
    api<{ items: T[] }>(path).then((r) => r.items);

export const loadFeed = (force = false): Promise<Cached<VideoItem[]>> => cached('feed', TTL.feed, list<VideoItem>('/api/yt/feed'), { force });

export const loadPlaylists = (force = false): Promise<Cached<PlaylistItem[]>> =>
  cached('playlists', TTL.playlists, list<PlaylistItem>('/api/yt/playlists'), { force });

export const loadPlaylistItems = (id: string, force = false): Promise<Cached<VideoItem[]>> =>
  cached(`pl:${id}`, TTL.playlistItems, list<VideoItem>(`/api/yt/playlist-items?id=${encodeURIComponent(id)}`), { force });

export const loadLiked = (force = false): Promise<Cached<VideoItem[]>> => cached('liked', TTL.liked, list<VideoItem>('/api/yt/liked'), { force });

export const loadPopular = (music: boolean, force = false): Promise<Cached<VideoItem[]>> =>
  cached(music ? 'popular:music' : 'popular', TTL.popular, list<VideoItem>(`/api/yt/popular${music ? '?music=1' : ''}`), { force });

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

export function untitledQueueIds(): string[] {
  return useQueue
    .getState()
    .items.filter((it) => !it.title)
    .map((it) => it.videoId);
}
