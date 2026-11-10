// GET /api/frame-check?url= (spec §9.3): fetch the page (GET, ≤ 5 redirects, 5 s), read its framing headers,
// drop the body. Never proxies content, never forwards cookies or auth, and re-checks every redirect hop for SSRF.
import type { FrameCheckResult } from '../../shared/webTypes';
import { framingDecision } from './framePolicy';
import { HttpError } from './http';
import { checkTargetUrl, isIpLiteral, resolvesPublic } from './ssrf';

export const MAX_REDIRECTS = 5;
export const TIMEOUT_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (compatible; JorGu-FrameCheck/1.0)';

type Fetcher = typeof fetch;

export async function frameCheck(target: string, appOrigin: string, doFetch: Fetcher = fetch, timeoutMs = TIMEOUT_MS): Promise<FrameCheckResult> {
  let url = checkTargetUrl(target);
  const signal = AbortSignal.timeout(timeoutMs);
  const resolved = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.toLowerCase();
    if (!isIpLiteral(host) && !resolved.has(host)) {
      // Throws TARGET_NOT_ALLOWED for private answers; false = no addresses or DoH unreachable (fetch nothing).
      if (!(await resolvesPublic(host, signal, doFetch))) return { status: 'unknown', finalUrl: url.href, reason: 'dns' };
      resolved.add(host);
    }
    let res: Response;
    try {
      res = await doFetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal,
        // A fresh header set: nothing from the caller's request (cookies, auth) is forwarded.
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      });
    } catch {
      return { status: 'unknown', finalUrl: url.href, reason: 'fetch' };
    }
    // Headers only: never read the body.
    await res.body?.cancel().catch(() => undefined);
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { status: 'unknown', finalUrl: url.href, reason: 'bad-redirect' };
      }
      url = checkTargetUrl(next); // a redirect to a private address, other port, or other scheme is rejected
      continue;
    }
    const decision = framingDecision(res.headers, appOrigin, url);
    if (decision) return { ...decision, finalUrl: url.href };
    // Error pages (bot walls, 403/5xx) don't tell us what the browser will get.
    if (res.status >= 400) return { status: 'unknown', finalUrl: url.href, reason: `http-${res.status}` };
    return { status: 'allowed', finalUrl: url.href, reason: 'no-headers' };
  }
  return { status: 'unknown', finalUrl: url.href, reason: 'redirects' };
}

/**
 * 10 checks a minute per client IP (§9.3, §15). In memory, so per Worker isolate: a best-effort brake, not a hard
 * quota. (The Workers Rate Limiting binding would be sturdier; its Free-plan availability is unconfirmed.)
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit = 10,
    private readonly windowMs = 60_000,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}

/** Requests from other sites' pages are refused (browsers send Sec-Fetch-Site; other clients are rate limited). */
export function assertNotCrossSite(req: Request): void {
  const site = req.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'BAD_ORIGIN');
}
