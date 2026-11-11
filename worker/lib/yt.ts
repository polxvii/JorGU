// YouTube Data API v3 calls made with the user's access token (spec §8.2).
import { HttpError } from './http';
import type { SessionContext } from './session';

const BASE = 'https://www.googleapis.com/youtube/v3/';

import type { CategoryItem, ChannelItem, PlaylistItem, VideoItem } from '../../shared/ytTypes';

export type { CategoryItem, ChannelItem, PlaylistItem, VideoItem };

interface Thumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}

interface Snippet {
  title?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  publishedAt?: string;
  thumbnails?: Thumbs;
  resourceId?: { videoId?: string; channelId?: string };
  assignable?: boolean;
  description?: string;
  tags?: string[];
}

interface ApiItem {
  id?: string | { videoId?: string };
  snippet?: Snippet;
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
    relatedPlaylists?: { uploads?: string };
    itemCount?: number;
    duration?: string;
  };
}

interface ApiPage {
  items?: ApiItem[];
  nextPageToken?: string;
}

const thumbOf = (t?: Thumbs) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? '';
const UNAVAILABLE = new Set(['Private video', 'Deleted video']);

/** One Data API GET. Refreshes once on 401; maps quotaExceeded to 429 QUOTA. */
export async function ytGet(ctx: SessionContext, path: string, params: Record<string, string | number>): Promise<ApiPage> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await ctx.require();
    ctx.units += path === 'search' ? 100 : 1;
    const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${s.at}` } });
    if (res.status === 401 && attempt === 0) {
      await ctx.refresh();
      continue;
    }
    if (res.ok) return (await res.json()) as ApiPage;
    const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? '';
    if (res.status === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) throw new HttpError(429, 'QUOTA');
    if (res.status === 401) throw new HttpError(401, 'REAUTH');
    throw new HttpError(502, 'YT_ERROR', { status: res.status, reason });
  }
  throw new HttpError(401, 'REAUTH');
}

async function allPages(ctx: SessionContext, path: string, params: Record<string, string | number>, maxPages: number) {
  const items: ApiItem[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await ytGet(ctx, path, { ...params, ...(pageToken ? { pageToken } : {}) });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

function videoFromVideosList(it: ApiItem): VideoItem | null {
  const id = typeof it.id === 'string' ? it.id : undefined;
  if (!id || !it.snippet?.title) return null;
  return { videoId: id, title: it.snippet.title, channel: it.snippet.channelTitle ?? '', thumb: thumbOf(it.snippet.thumbnails), publishedAt: it.snippet.publishedAt };
}

/** ISO 8601 duration (PT1H2M3S, P1DT2H) to seconds; null if it can't be read. */
export function parseDuration(iso: string | undefined): number | null {
  const m = iso ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso) : null;
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/**
 * The API has no "is a Short" field (user request 2026-11-11: hide Shorts). Guess from length: up to 60 s, or up to
 * 3 min when tagged #shorts. Live streams (duration 0) are not Shorts.
 */
export function looksLikeShort(seconds: number | null, snippet: Snippet | undefined): boolean {
  if (seconds === null || seconds <= 0) return false;
  if (seconds <= 60) return true;
  if (seconds > 180) return false;
  const text = [snippet?.title ?? '', snippet?.description ?? '', ...(snippet?.tags ?? [])].join(' ');
  return /#shorts?\b/i.test(text);
}

/** videos.list (snippet + contentDetails, 1 unit per 50 ids): drops Shorts, adds durations. Order kept. */
async function withoutShorts(ctx: SessionContext, list: VideoItem[]): Promise<VideoItem[]> {
  const info = new Map<string, { seconds: number | null; short: boolean }>();
  for (let i = 0; i < list.length; i += 50) {
    const ids = list.slice(i, i + 50).map((v) => v.videoId);
    const page = await ytGet(ctx, 'videos', { part: 'snippet,contentDetails', id: ids.join(','), maxResults: 50 });
    for (const it of page.items ?? []) {
      if (typeof it.id !== 'string') continue;
      const seconds = parseDuration(it.contentDetails?.duration);
      info.set(it.id, { seconds, short: looksLikeShort(seconds, it.snippet) });
    }
  }
  return list
    .filter((v) => !info.get(v.videoId)?.short)
    .map((v) => {
      const seconds = info.get(v.videoId)?.seconds;
      return typeof seconds === 'number' ? { ...v, duration: seconds } : v;
    });
}

function videoFromPlaylistItem(it: ApiItem): VideoItem | null {
  const id = it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId;
  const title = it.snippet?.title;
  if (!id || !title || UNAVAILABLE.has(title)) return null;
  return {
    videoId: id,
    title,
    channel: it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? '',
    thumb: thumbOf(it.snippet?.thumbnails),
    publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt,
  };
}

function videoFromSearch(it: ApiItem): VideoItem | null {
  const id = typeof it.id === 'object' ? it.id.videoId : undefined;
  if (!id || !it.snippet?.title) return null;
  return { videoId: id, title: decodeEntities(it.snippet.title), channel: decodeEntities(it.snippet.channelTitle ?? ''), thumb: thumbOf(it.snippet.thumbnails), publishedAt: it.snippet.publishedAt };
}

/** search.list returns HTML-escaped titles. */
function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] ?? _);
}

export async function subscriptions(ctx: SessionContext, order: 'relevance' | 'alphabetical' = 'alphabetical', maxPages = 5): Promise<ChannelItem[]> {
  const items = await allPages(ctx, 'subscriptions', { part: 'snippet', mine: 'true', maxResults: 50, order }, maxPages);
  return items
    .map((it) => ({ channelId: it.snippet?.resourceId?.channelId ?? '', title: it.snippet?.title ?? '', thumb: thumbOf(it.snippet?.thumbnails) }))
    .filter((c) => c.channelId);
}

/**
 * "New from subscriptions" (§8.2): uploads playlists of the most relevant channels, 5 newest each.
 * Capped at 40 channels: the Workers free plan allows 50 subrequests per request [Verify plan limit].
 */
export async function feed(ctx: SessionContext, limit: number): Promise<VideoItem[]> {
  const n = Math.max(1, Math.min(40, limit));
  const subs = await ytGet(ctx, 'subscriptions', { part: 'snippet', mine: 'true', maxResults: n, order: 'relevance' });
  const channelIds = (subs.items ?? []).map((it) => it.snippet?.resourceId?.channelId).filter((x): x is string => !!x);
  if (channelIds.length === 0) return [];
  const channels = await ytGet(ctx, 'channels', { part: 'contentDetails', id: channelIds.join(','), maxResults: 50 });
  const uploads = (channels.items ?? []).map((c) => c.contentDetails?.relatedPlaylists?.uploads).filter((x): x is string => !!x);
  const results: VideoItem[] = [];
  const queue = [...uploads];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const page = await ytGet(ctx, 'playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: 5 });
        for (const it of page.items ?? []) {
          const v = videoFromPlaylistItem(it);
          if (v) results.push(v);
        }
      } catch (e) {
        if (e instanceof HttpError && (e.code === 'QUOTA' || e.code === 'REAUTH')) throw e;
        // One channel failing (e.g. no uploads playlist) must not break the feed.
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  // 40 channels + subscriptions + channels + 2 videos.list calls stay under the 50-subrequest limit.
  const newest = results.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 100);
  return withoutShorts(ctx, newest);
}

export async function playlists(ctx: SessionContext): Promise<PlaylistItem[]> {
  const items = await allPages(ctx, 'playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50 }, 4);
  return items
    .map((it) => ({ id: typeof it.id === 'string' ? it.id : '', title: it.snippet?.title ?? '', count: it.contentDetails?.itemCount ?? 0, thumb: thumbOf(it.snippet?.thumbnails) }))
    .filter((p) => p.id);
}

export async function playlistItems(ctx: SessionContext, playlistId: string): Promise<VideoItem[]> {
  const items = await allPages(ctx, 'playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: 50 }, 10);
  return items.map(videoFromPlaylistItem).filter((v): v is VideoItem => !!v);
}

export async function liked(ctx: SessionContext): Promise<VideoItem[]> {
  const items = await allPages(ctx, 'videos', { part: 'snippet', myRating: 'like', maxResults: 50 }, 4);
  return items.map(videoFromVideosList).filter((v): v is VideoItem => !!v);
}

/**
 * Popular in Thailand (chart=mostPopular), optionally for one video category (10 = Music). 1 quota unit.
 * A category without a chart in this region (400 videoChartNotFound) is an empty list, not an error.
 */
export async function popular(ctx: SessionContext, categoryId: string | null): Promise<VideoItem[]> {
  try {
    const page = await ytGet(ctx, 'videos', {
      part: 'snippet,contentDetails',
      chart: 'mostPopular',
      regionCode: 'TH',
      maxResults: 30,
      ...(categoryId ? { videoCategoryId: categoryId } : {}),
    });
    return (page.items ?? [])
      .flatMap((it) => {
        const v = videoFromVideosList(it);
        const seconds = parseDuration(it.contentDetails?.duration);
        if (!v || looksLikeShort(seconds, it.snippet)) return [];
        return [seconds === null ? v : { ...v, duration: seconds }];
      });
  } catch (e) {
    if (e instanceof HttpError && e.code === 'YT_ERROR' && e.extra.reason === 'videoChartNotFound') return [];
    throw e;
  }
}

/** Video categories creators can use in Thailand, titled in the UI language (videoCategories.list, 1 unit). */
export async function categories(ctx: SessionContext, lang: string): Promise<CategoryItem[]> {
  const page = await ytGet(ctx, 'videoCategories', { part: 'snippet', regionCode: 'TH', hl: lang === 'th' ? 'th' : 'en' });
  return (page.items ?? [])
    .filter((it) => typeof it.id === 'string' && it.snippet?.assignable && it.snippet.title)
    .map((it) => ({ id: it.id as string, title: it.snippet!.title! }));
}

export async function search(ctx: SessionContext, q: string, lang: string): Promise<VideoItem[]> {
  const page = await ytGet(ctx, 'search', {
    part: 'snippet',
    type: 'video',
    q,
    maxResults: 20,
    regionCode: 'TH',
    relevanceLanguage: lang === 'th' ? 'th' : 'en',
  });
  return (page.items ?? []).map(videoFromSearch).filter((v): v is VideoItem => !!v);
}

export async function videos(ctx: SessionContext, ids: string[]): Promise<VideoItem[]> {
  if (ids.length === 0) return [];
  const page = await ytGet(ctx, 'videos', { part: 'snippet', id: ids.slice(0, 50).join(',') });
  return (page.items ?? []).map(videoFromVideosList).filter((v): v is VideoItem => !!v);
}
