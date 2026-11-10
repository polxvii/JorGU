// /api/frame-check (spec §9.3): framing rules, SSRF guard (incl. after redirects), rate limit. DNS and sites mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../worker/index';
import { frameCheck } from '../../worker/lib/frameCheck';
import { framingDecision, sourceMatches } from '../../worker/lib/framePolicy';
import { HttpError } from '../../worker/lib/http';
import { checkTargetUrl, isPublicIp, parseIPv6 } from '../../worker/lib/ssrf';
import type { Env } from '../../worker/lib/env';

const APP = 'https://jorgu.example.workers.dev';

/** Host → addresses the mocked DNS-over-HTTPS returns. */
const DNS: Record<string, string[]> = {
  'site.example': ['93.184.216.34'],
  'www.site.example': ['93.184.216.34', '2606:4700::6810:84e5'],
  'other.example': ['93.184.216.35'],
  'evil.example': ['10.0.0.5'],
  'rebind.example': ['93.184.216.36', '127.0.0.1'],
  'v6local.example': ['::1'],
  'meta.example': ['169.254.169.254'],
};

type Site = (url: URL, init: RequestInit) => Response | Promise<Response>;
let sites: Record<string, Site>;
const siteFetches: { url: string; init: RequestInit }[] = [];

function doh(url: URL): Response {
  const name = url.searchParams.get('name')!;
  const type = url.searchParams.get('type');
  const addrs = (DNS[name] ?? []).filter((a) => (type === 'AAAA' ? a.includes(':') : !a.includes(':')));
  if (!DNS[name]) return Response.json({ Status: 3 });
  return Response.json({ Status: 0, Answer: addrs.map((data) => ({ name: `${name}.`, type: type === 'AAAA' ? 28 : 1, TTL: 60, data })) });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  if (url.origin === 'https://cloudflare-dns.com') return doh(url);
  siteFetches.push({ url: url.href, init });
  const site = sites[url.href];
  if (!site) throw new TypeError('network error');
  return site(url, init);
});

const page = (headers: Record<string, string> = {}, status = 200): Site => () => new Response('<html>secret body</html>', { status, headers });
const moved = (to: string, status = 301): Site => () => new Response(null, { status, headers: { Location: to } });

async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof HttpError ? `${e.status} ${e.code}` : String(e);
  }
}

beforeEach(() => {
  sites = {};
  siteFetches.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('SSRF guard', () => {
  it('only public IPv4/IPv6 addresses pass', () => {
    for (const ok of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '2a00:1450:4001::200e']) {
      expect(isPublicIp(ok), ok).toBe(true);
    }
    for (const bad of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '0.0.0.0', '255.255.255.255', '224.0.0.1', '198.18.0.1', '192.0.2.1',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe',
      '64:ff9b::a00:1', '2002:7f00:1::', '2001:db8::1', '2001::1', 'ff02::1', '100::1', 'not-an-ip', '1.2.3',
    ]) {
      expect(isPublicIp(bad), bad).toBe(false);
    }
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6('1::2::3')).toBeNull();
  });

  it('rejects private hosts, odd ports, credentials, and non-web schemes before any fetch', () => {
    for (const bad of [
      'http://localhost/', 'http://foo.localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.0.0.1/',
      'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/',
      'http://192.168.1.1/', 'https://example.com:8443/', 'https://user:pw@example.com/', 'ftp://example.com/',
      'file:///etc/passwd', 'javascript:alert(1)', 'http://intranet/', 'not a url',
    ]) {
      expect(() => checkTargetUrl(bad), bad).toThrow(HttpError);
    }
    for (const ok of ['https://example.com/', 'http://example.com:80/x', 'https://example.com:443/', 'https://8.8.8.8/']) {
      expect(() => checkTargetUrl(ok), ok).not.toThrow();
    }
  });

  it('rejects names whose DNS answers include a private address (incl. mixed answers), and never fetches them', async () => {
    for (const host of ['evil.example', 'rebind.example', 'v6local.example', 'meta.example']) {
      sites[`https://${host}/`] = page();
      expect(await rejection(frameCheck(`https://${host}/`, APP, fetchMock)), host).toBe('400 TARGET_NOT_ALLOWED');
    }
    expect(siteFetches).toEqual([]);
  });

  it('rejects a redirect to a private address and does not follow it', async () => {
    sites['https://site.example/'] = moved('http://169.254.169.254/latest/meta-data/', 302);
    expect(await rejection(frameCheck('https://site.example/', APP, fetchMock))).toBe('400 TARGET_NOT_ALLOWED');
    sites['https://site.example/'] = moved('https://evil.example/');
    expect(await rejection(frameCheck('https://site.example/', APP, fetchMock))).toBe('400 TARGET_NOT_ALLOWED');
    sites['https://site.example/'] = moved('https://site.example:8080/');
    expect(await rejection(frameCheck('https://site.example/', APP, fetchMock))).toBe('400 TARGET_NOT_ALLOWED');
    expect(siteFetches.map((f) => f.url).every((u) => u === 'https://site.example/')).toBe(true);
  });
});

describe('framing rules', () => {
  const site = new URL('https://site.example/');
  const decide = (h: Record<string, string>) => framingDecision(new Headers(h), APP, site);

  it('X-Frame-Options per the HTML standard', () => {
    expect(decide({ 'X-Frame-Options': 'DENY' })).toEqual({ status: 'blocked', reason: 'xfo-deny' });
    expect(decide({ 'X-Frame-Options': 'sameorigin' })).toEqual({ status: 'blocked', reason: 'xfo-sameorigin' });
    expect(decide({ 'X-Frame-Options': 'SAMEORIGIN, SAMEORIGIN' })?.status).toBe('blocked');
    expect(decide({ 'X-Frame-Options': 'deny, sameorigin' })).toEqual({ status: 'blocked', reason: 'xfo-conflict' });
    expect(decide({ 'X-Frame-Options': 'ALLOW-FROM https://jorgu.example.workers.dev' })?.status).toBe('allowed');
    expect(decide({})).toBeNull();
  });

  it('CSP frame-ancestors decides and overrides X-Frame-Options', () => {
    expect(decide({ 'Content-Security-Policy': "frame-ancestors 'none'" })?.status).toBe('blocked');
    expect(decide({ 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'" })).toEqual({ status: 'blocked', reason: 'csp-mismatch' });
    expect(decide({ 'Content-Security-Policy': 'frame-ancestors https://other.example' })?.status).toBe('blocked');
    expect(decide({ 'Content-Security-Policy': 'frame-ancestors *' })?.status).toBe('allowed');
    expect(decide({ 'Content-Security-Policy': 'frame-ancestors https:' })?.status).toBe('allowed');
    expect(decide({ 'Content-Security-Policy': 'frame-ancestors *.workers.dev' })?.status).toBe('allowed');
    expect(decide({ 'Content-Security-Policy': `frame-ancestors 'self' ${APP}` })?.status).toBe('allowed');
    expect(decide({ 'Content-Security-Policy': 'frame-ancestors *', 'X-Frame-Options': 'DENY' })?.status).toBe('allowed');
    // Two policies: both must allow.
    expect(decide({ 'Content-Security-Policy': "frame-ancestors *, frame-ancestors 'none'" })?.status).toBe('blocked');
    // Report-only policies are not enforced.
    expect(decide({ 'Content-Security-Policy-Report-Only': "frame-ancestors 'none'" })).toBeNull();
  });

  it('host-source matching', () => {
    const app = new URL(APP);
    expect(sourceMatches('jorgu.example.workers.dev', app, site)).toBe(true);
    expect(sourceMatches('https://*.example.workers.dev:443', app, site)).toBe(true);
    expect(sourceMatches('https://jorgu.example.workers.dev:8443', app, site)).toBe(false);
    expect(sourceMatches('*.jorgu.example.workers.dev', app, site)).toBe(false);
    expect(sourceMatches("'unsafe-inline'", app, site)).toBe(false);
  });
});

describe('frameCheck()', () => {
  it('no framing headers → allowed; the body is cancelled, not read', async () => {
    let cancelled = false;
    sites['https://site.example/'] = () =>
      new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), { status: 200 });
    expect(await frameCheck('https://site.example/', APP, fetchMock)).toEqual({ status: 'allowed', finalUrl: 'https://site.example/', reason: 'no-headers' });
    expect(cancelled).toBe(true);
  });

  it('follows redirects (re-resolving each host) and reports the final URL', async () => {
    sites['https://site.example/'] = moved('https://www.site.example/home');
    sites['https://www.site.example/home'] = page({ 'X-Frame-Options': 'SAMEORIGIN' });
    expect(await frameCheck('https://site.example/', APP, fetchMock)).toEqual({ status: 'blocked', finalUrl: 'https://www.site.example/home', reason: 'xfo-sameorigin' });
    const dohNames = fetchMock.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.origin === 'https://cloudflare-dns.com').map((u) => u.searchParams.get('name'));
    expect(new Set(dohNames)).toEqual(new Set(['site.example', 'www.site.example']));
  });

  it('gives up after 5 redirects', async () => {
    for (let i = 0; i < 8; i++) sites[`https://site.example/${i}`] = moved(`https://site.example/${i + 1}`);
    const r = await frameCheck('https://site.example/0', APP, fetchMock);
    expect(r).toMatchObject({ status: 'unknown', reason: 'redirects' });
    expect(siteFetches).toHaveLength(6);
  });

  it('unknown when the fetch fails, times out, the name does not resolve, or an error page has no headers', async () => {
    expect((await frameCheck('https://other.example/', APP, fetchMock)).reason).toBe('fetch');
    expect((await frameCheck('https://nowhere.example/', APP, fetchMock)).reason).toBe('dns');
    sites['https://site.example/'] = page({}, 403);
    expect(await frameCheck('https://site.example/', APP, fetchMock)).toMatchObject({ status: 'unknown', reason: 'http-403' });
    sites['https://site.example/'] = (_u, init) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))));
    expect(await frameCheck('https://site.example/', APP, fetchMock, 50)).toMatchObject({ status: 'unknown', reason: 'fetch' });
  });
});

describe('GET /api/frame-check', () => {
  // No OAuth secrets: the frame check needs no account.
  const env: Env = { ASSETS: {} as Env['ASSETS'], APP_ORIGIN: APP };
  let ip = 0;
  const call = (target: string, init: RequestInit = {}, client = `203.0.113.${++ip}`) => {
    const headers = new Headers(init.headers);
    headers.set('CF-Connecting-IP', client);
    return handleApi(new Request(`${APP}/api/frame-check?url=${encodeURIComponent(target)}`, { ...init, headers }), env);
  };

  it('answers without OAuth config and forwards no cookies or auth', async () => {
    sites['https://site.example/'] = page({ 'Content-Security-Policy': "frame-ancestors 'none'" });
    const res = await call('https://site.example/', { headers: { Cookie: 'jg_session=SECRET', Authorization: 'Bearer SECRET' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'blocked', finalUrl: 'https://site.example/', reason: 'csp-none' });
    const sent = new Headers(siteFetches[0].init.headers);
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
    expect(siteFetches[0].init.redirect).toBe('manual');
  });

  it('400 for private targets (localhost, metadata, private IPs) and bad input; 405 for POST', async () => {
    for (const t of ['http://localhost:8787/', 'http://169.254.169.254/', 'http://192.168.0.1/', 'https://evil.example/']) {
      const res = await call(t);
      expect(res.status, t).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('TARGET_NOT_ALLOWED');
    }
    expect((await call('')).status).toBe(400);
    expect((await call('https://site.example/', { method: 'POST' })).status).toBe(405);
    expect(siteFetches).toEqual([]);
  });

  it('refuses cross-site callers and rate limits 10 checks a minute per client', async () => {
    sites['https://site.example/'] = page();
    expect((await call('https://site.example/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call('https://site.example/', {}, '198.51.100.7')).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect((await call('https://site.example/', {}, '198.51.100.8')).status).toBe(200);
  });
});
