// Client side of the frame check (spec §9.3): ask /api/frame-check, cache allowed/blocked per origin for 7 days
// in IndexedDB. Anything else (offline, no Worker, rate limited, private address) is "unknown": try embedding.
import { createStore, get, set } from 'idb-keyval';
import type { FrameCheckResult } from '../../../shared/webTypes';
import { originOf } from './normalizeUrl';

export const FRAME_CHECK_TTL = 7 * 24 * 3600_000;
const TIMEOUT_MS = 8000;

const store = typeof indexedDB === 'undefined' ? undefined : createStore('jorgu-web', 'frame-check');
const inflight = new Map<string, Promise<FrameCheckResult>>();

interface Entry {
  t: number;
  v: FrameCheckResult;
}

const unknown = (url: string, reason: string): FrameCheckResult => ({ status: 'unknown', finalUrl: url, reason });

async function ask(url: string): Promise<FrameCheckResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/frame-check?url=${encodeURIComponent(url)}`, { signal: ctl.signal, credentials: 'same-origin' });
    if (!res.ok) return unknown(url, `api-${res.status}`);
    const body = (await res.json()) as Partial<FrameCheckResult>;
    if (body.status !== 'allowed' && body.status !== 'blocked' && body.status !== 'unknown') return unknown(url, 'api-shape');
    return { status: body.status, finalUrl: String(body.finalUrl ?? url), reason: String(body.reason ?? '') };
  } catch {
    return unknown(url, 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** Cached per origin; `force` asks the server again. */
export function checkFrame(url: string, force = false): Promise<FrameCheckResult> {
  const origin = originOf(url);
  const key = origin || url;
  const running = inflight.get(key);
  if (running && !force) return running;
  const p = (async () => {
    if (store && !force) {
      try {
        const hit = await get<Entry>(key, store);
        if (hit && Date.now() - hit.t < FRAME_CHECK_TTL) return hit.v;
      } catch {
        /* storage blocked: ask the server */
      }
    }
    const v = await ask(url);
    if (store && v.status !== 'unknown') await set(key, { t: Date.now(), v } satisfies Entry, store).catch(() => undefined);
    return v;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
