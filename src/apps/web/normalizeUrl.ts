// URL bar input → a web address (spec §9.2). Bare domains get https://; only http/https are accepted.
// A typed http:// address is kept as typed: the Web app tries https first (plain http can't load inside https).

export type Normalized =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'scheme' | 'invalid' | 'self' };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const OTHER_SCHEME = /^(javascript|data|file|blob|about|vbscript|mailto|tel|sms|ftp|ws|wss|chrome|intent|filesystem|view-source):/i;

export function normalizeUrl(input: string, selfOrigin?: string): Normalized {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (OTHER_SCHEME.test(text)) return { ok: false, reason: 'scheme' };
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' };
  const host = url.hostname;
  // A web address needs a dot (example.com) or an IP literal; "weather bangkok" or "intranet" is not one.
  if (!host || !(host.includes('.') || host.startsWith('['))) return { ok: false, reason: 'invalid' };
  if (selfOrigin && toHttps(url.href).startsWith(`${selfOrigin}/`)) return { ok: false, reason: 'self' };
  return { ok: true, url: url.href };
}

export type SearchEngine = 'google' | 'bing';

/** Text that isn't a web address is a search (user 2026-11-13). Google doesn't allow its results inside another
 * site's frame (X-Frame-Options), so a Google search offers "Open in new tab" or Bing, which shows in the pane. */
export function searchUrl(query: string, engine: SearchEngine): string {
  const q = encodeURIComponent(query.trim()).replace(/%20/g, '+');
  return engine === 'bing' ? `https://www.bing.com/search?q=${q}` : `https://www.google.com/search?q=${q}`;
}

/** The search text, when `url` is one of our search URLs. */
export function searchQuery(url: string): { engine: SearchEngine; q: string } | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q');
    if (!q || u.pathname !== '/search') return null;
    if (u.hostname === 'www.google.com') return { engine: 'google', q };
    if (u.hostname === 'www.bing.com') return { engine: 'bing', q };
  } catch {
    /* not a URL */
  }
  return null;
}

/** The address the iframe loads: always https (http inside an https app is blocked as mixed content). */
export function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Short label for headers and lists: host without "www.". */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
