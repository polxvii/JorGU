// IndexedDB cache for API responses (spec §8.2). TTLs ≤ 24 h; anything older than 30 days is dropped
// (YouTube API Services Developer Policies §III.E.4). Cleared completely on disconnect.
import { clear, createStore, del, entries, get, set } from 'idb-keyval';
import { ApiError } from './api';

const store = typeof indexedDB === 'undefined' ? undefined : createStore('jorgu-cache', 'api');
export const MAX_AGE_MS = 30 * 24 * 3600_000;

interface Entry<T> {
  t: number;
  v: T;
}

export interface Cached<T> {
  data: T;
  at: number;
  /** Served from cache because the network call failed (offline, expired login, quota). */
  stale: boolean;
}

/** Errors where older cached data is better than nothing (§8.1: cached playlists keep working until reconnection). */
const SERVE_STALE = new Set(['OFFLINE', 'REAUTH', 'NOT_CONNECTED', 'QUOTA', 'HTTP', 'INTERNAL', 'YT_ERROR', 'TOKEN_ERROR']);

export async function peek<T>(key: string): Promise<Entry<T> | undefined> {
  if (!store) return undefined;
  try {
    const hit = await get<Entry<T>>(key, store);
    return hit && Date.now() - hit.t <= MAX_AGE_MS ? hit : undefined;
  } catch {
    return undefined;
  }
}

export async function put<T>(key: string, v: T): Promise<void> {
  if (!store) return;
  try {
    await set(key, { t: Date.now(), v } satisfies Entry<T>, store);
  } catch {
    /* storage full or blocked: run without cache */
  }
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { force?: boolean } = {}): Promise<Cached<T>> {
  const hit = await peek<T>(key);
  if (hit && !opts.force && Date.now() - hit.t < ttlMs) return { data: hit.v, at: hit.t, stale: false };
  try {
    const v = await load();
    await put(key, v);
    return { data: v, at: Date.now(), stale: false };
  } catch (e) {
    if (hit && e instanceof ApiError && SERVE_STALE.has(e.code)) return { data: hit.v, at: hit.t, stale: true };
    throw e;
  }
}

/** Startup: drop entries older than 30 days. */
export async function purgeOld(now = Date.now()): Promise<void> {
  if (!store) return;
  try {
    for (const [k, e] of await entries<IDBValidKey, Entry<unknown>>(store)) {
      if (!e || typeof e.t !== 'number' || now - e.t > MAX_AGE_MS) await del(k, store);
    }
  } catch {
    /* ignore */
  }
}

export async function clearAll(): Promise<void> {
  if (!store) return;
  try {
    await clear(store);
  } catch {
    /* ignore */
  }
}
