// SSRF guard for /api/frame-check (spec §9.3): only http/https on ports 80/443, no credentials, and every address
// a host resolves to must be public. Workers have no DNS API, so names resolve through DNS-over-HTTPS.
import { HttpError } from './http';

export const DOH_URL = 'https://cloudflare-dns.com/dns-query';

function notAllowed(why: string): HttpError {
  return new HttpError(400, 'TARGET_NOT_ALLOWED', { why });
}

/** Dotted-quad IPv4 → 4 octets, or null. (WHATWG URL already turns 0x7f.1, 2130706433 … into dotted form.) */
export function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** IPv6 text (no brackets, optional embedded IPv4 tail) → 8 hextets, or null. */
export function parseIPv6(s: string): number[] | null {
  const text = s.toLowerCase();
  // Zone ids (fe80::1%eth0) only exist for link-local addresses.
  if (text.includes('%') || !text.includes(':')) return null;
  let body = text;
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseIPv4(last);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    body = text.slice(0, lastColon + 1);
    if (!body.endsWith('::')) body = body.slice(0, -1);
  }
  const halves = body.split('::');
  if (halves.length > 2) return null;
  const words = (part: string) => (part === '' ? [] : part.split(':'));
  const head = words(halves[0]);
  const rest = halves.length === 2 ? words(halves[1]) : [];
  if (![...head, ...rest].every((w) => /^[0-9a-f]{1,4}$/.test(w))) return null;
  const h = head.map((w) => parseInt(w, 16));
  const r = rest.map((w) => parseInt(w, 16));
  const want = 8 - tail.length;
  if (halves.length === 1) return h.length === want ? [...h, ...tail] : null;
  const fill = want - h.length - r.length;
  if (fill < 1) return null;
  return [...h, ...new Array<number>(fill).fill(0), ...r, ...tail];
}

function inV4(a: number[], base: [number, number, number, number], bits: number): boolean {
  const ip = ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
  const b = ((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
}

const V4_BLOCKED: [[number, number, number, number], number][] = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, cloud metadata (169.254.169.254)
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // documentation
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentation
  [[203, 0, 113, 0], 24], // documentation
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved + broadcast
];

export function isPublicIPv4(a: number[]): boolean {
  return !V4_BLOCKED.some(([base, bits]) => inV4(a, base, bits));
}

const v4From = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

export function isPublicIPv6(w: number[]): boolean {
  // IPv4-mapped ::ffff:a.b.c.d and NAT64 64:ff9b::a.b.c.d carry an IPv4 address: judge that one.
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) return isPublicIPv4(v4From(w[6], w[7]));
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(v4From(w[6], w[7]));
  // 6to4 2002:AABB:CCDD::/48 embeds an IPv4 address too.
  if (w[0] === 0x2002) return isPublicIPv4(v4From(w[1], w[2]));
  // Only global unicast 2000::/3 is public; that covers ::, ::1, fc00::/7, fe80::/10, ff00::/8, 100::/64, 64:ff9b:1::/48.
  if ((w[0] & 0xe000) !== 0x2000) return false;
  // Special-purpose blocks inside 2000::/3: 2001::/23 (Teredo, ORCHID, benchmarking …) and 2001:db8::/32 (docs).
  if (w[0] === 0x2001 && w[1] < 0x0200) return false;
  if (w[0] === 0x2001 && w[1] === 0x0db8) return false;
  return true;
}

/** True only for a syntactically valid, public IPv4 or IPv6 address. */
export function isPublicIp(addr: string): boolean {
  const bare = addr.startsWith('[') && addr.endsWith(']') ? addr.slice(1, -1) : addr;
  const v4 = parseIPv4(bare);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(bare);
  return v6 ? isPublicIPv6(v6) : false;
}

export function isIpLiteral(host: string): boolean {
  return !!parseIPv4(host) || (host.startsWith('[') && host.endsWith(']'));
}

/** Parses and checks the form of a target URL (scheme, port, credentials, host). Throws HttpError 400. */
export function checkTargetUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'BAD_URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw notAllowed('scheme');
  if (url.username || url.password) throw notAllowed('credentials');
  // WHATWG URL drops default ports, so any port left is not 80/443.
  if (url.port !== '') throw notAllowed('port');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new HttpError(400, 'BAD_URL');
  if (isIpLiteral(host)) {
    if (!isPublicIp(host)) throw notAllowed('private-ip');
    return url;
  }
  if (host === 'localhost' || host.endsWith('.localhost')) throw notAllowed('localhost');
  // Single-label names (intranet, router …) are never public sites.
  if (!host.includes('.')) throw notAllowed('single-label');
  return url;
}

interface DohAnswer {
  type?: number;
  data?: string;
}

type Fetcher = typeof fetch;

/**
 * Resolves A and AAAA records via DoH. Returns false when the name has no addresses (or DoH failed: nothing is
 * fetched then). Throws TARGET_NOT_ALLOWED if any address is not public.
 */
export async function resolvesPublic(host: string, signal: AbortSignal, doFetch: Fetcher = fetch): Promise<boolean> {
  const name = host.replace(/\.$/, '');
  const lookups = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      try {
        const res = await doFetch(`${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`, {
          headers: { Accept: 'application/dns-json' },
          signal,
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { Status?: number; Answer?: DohAnswer[] };
        return (body.Answer ?? []).filter((a) => (a.type === 1 || a.type === 28) && typeof a.data === 'string').map((a) => a.data!);
      } catch {
        return null;
      }
    }),
  );
  if (lookups.every((l) => l === null)) return false;
  const addrs = lookups.flatMap((l) => l ?? []);
  if (addrs.some((a) => !isPublicIp(a))) throw notAllowed('private-dns');
  return addrs.length > 0;
}
