// Worker API tests with Google mocked (spec §8.1, §8.2, §15). Runs in Node: Web Crypto, fetch, Request/Response.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../worker/index';
import { b64urlEncode, open, seal } from '../../worker/lib/crypto';
import type { Env } from '../../worker/lib/env';
import type { Session } from '../../worker/lib/session';

const SECRET = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i * 7 + 1)));
const ORIGIN = 'https://jorgu.example';
const env: Env = {
  ASSETS: {} as Env['ASSETS'],
  APP_ORIGIN: ORIGIN,
  OAUTH_REDIRECT_URI: `${ORIGIN}/api/auth/callback`,
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-test-secret',
  SESSION_SECRET: SECRET,
};

const AT = 'ya29.ACCESS-TOKEN-SECRET';
const RT = '1//REFRESH-TOKEN-SECRET';

function idToken(claims: Record<string, string>): string {
  const enc = (o: object) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}

async function sessionCookie(patch: Partial<Session> = {}): Promise<string> {
  const s: Session = { v: 1, rt: RT, at: AT, exp: Date.now() + 3600_000, email: 'me@example.com', name: 'Me', picture: '', ...patch };
  return `jg_session=${await seal(SECRET, 'jg_session', s)}`;
}

function req(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;
let google: Route;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => google(new URL(String(input)), init));

beforeEach(() => {
  google = () => new Response('unexpected', { status: 500 });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('crypto', () => {
  it('round-trips and rejects tampering, wrong purpose, or wrong key', async () => {
    const sealed = await seal(SECRET, 'p', { a: 1 });
    expect(await open(SECRET, 'p', sealed)).toEqual({ a: 1 });
    expect(await open(SECRET, 'other', sealed)).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(await open(SECRET, 'p', flipped)).toBeNull();
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    expect(await open(otherKey, 'p', sealed)).toBeNull();
  });
});

describe('/api/health', () => {
  it('reports presence only, never values', async () => {
    const res = await handleApi(req('/api/health'), env);
    const text = await res.text();
    expect(text).toContain('"sessionSecret":"ok"');
    expect(text).not.toContain('GOCSPX');
    expect(text).not.toContain(SECRET);
  });
});

describe('OAuth login + callback', () => {
  it('login redirects to Google with offline access and a state cookie', async () => {
    const res = await handleApi(req('/api/auth/login'), env);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location')!);
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(loc.searchParams.get('access_type')).toBe('offline');
    expect(loc.searchParams.get('prompt')).toBe('consent');
    expect(loc.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const c = setCookies(res)[0];
    expect(c).toMatch(/^jg_oauth=.+; Path=\/api\/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
  });

  async function startLogin() {
    const res = await handleApi(req('/api/auth/login'), env);
    const state = new URL(res.headers.get('Location')!).searchParams.get('state')!;
    const stateCookie = setCookies(res)[0].split(';')[0];
    return { state, stateCookie };
  }

  it('rejects a state mismatch', async () => {
    const { stateCookie } = await startLogin();
    const res = await handleApi(req('/api/auth/callback?code=x&state=wrong', { cookie: stateCookie }), env);
    expect(res.headers.get('Location')).toBe('/?yt=error&reason=state');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the code and sets an encrypted httpOnly session cookie', async () => {
    const { state, stateCookie } = await startLogin();
    google = (url, init) => {
      expect(url.href).toBe('https://oauth2.googleapis.com/token');
      const body = new URLSearchParams(String(init.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_secret')).toBe('GOCSPX-test-secret');
      expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{64}$/);
      return Response.json({ access_token: AT, refresh_token: RT, expires_in: 3599, id_token: idToken({ email: 'me@example.com', name: 'Me', picture: 'https://lh3.googleusercontent.com/x' }) });
    };
    const res = await handleApi(req(`/api/auth/callback?code=abc&state=${state}`, { cookie: stateCookie }), env);
    expect(res.headers.get('Location')).toBe('/?yt=connected');
    const cookies = setCookies(res);
    const session = cookies.find((c) => c.startsWith('jg_session='))!;
    expect(session).toMatch(/HttpOnly; Secure; SameSite=Lax$/);
    expect(session).toContain('Max-Age=15552000');
    expect(session).not.toContain('ya29');
    expect(session).not.toContain('REFRESH');
    expect(cookies.some((c) => c.startsWith('jg_oauth=;'))).toBe(true);
  });

  it('user cancelling consent → /?yt=denied', async () => {
    const res = await handleApi(req('/api/auth/callback?error=access_denied'), env);
    expect(res.headers.get('Location')).toBe('/?yt=denied');
  });
});

describe('/api/auth/me', () => {
  it('returns profile without tokens', async () => {
    const res = await handleApi(req('/api/auth/me', { cookie: await sessionCookie() }), env);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ connected: true, email: 'me@example.com', name: 'Me', picture: '' });
    expect(text).not.toContain(AT);
    expect(text).not.toContain(RT);
  });
  it('disconnected without a cookie', async () => {
    const res = await handleApi(req('/api/auth/me'), env);
    expect(await res.json()).toEqual({ connected: false });
  });
});

describe('Data API proxy', () => {
  it('refreshes an expiring access token and re-sets the cookie', async () => {
    const calls: string[] = [];
    google = (url, init) => {
      calls.push(url.hostname + url.pathname);
      if (url.pathname === '/token') {
        expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe('refresh_token');
        return Response.json({ access_token: 'ya29.NEW', expires_in: 3599 });
      }
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer ya29.NEW');
      return Response.json({ items: [{ id: 'M7lc1UVf-VE', snippet: { title: 'Liked one', channelTitle: 'Ch', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/M7lc1UVf-VE/mqdefault.jpg' } } } }] });
    };
    const res = await handleApi(req('/api/yt/liked', { cookie: await sessionCookie({ exp: Date.now() - 1000 }) }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ videoId: 'M7lc1UVf-VE', title: 'Liked one', channel: 'Ch', thumb: 'https://i.ytimg.com/vi/M7lc1UVf-VE/mqdefault.jpg' }] });
    expect(calls).toEqual(['oauth2.googleapis.com/token', 'www.googleapis.com/youtube/v3/videos']);
    expect(res.headers.get('X-Quota-Units')).toBe('1');
    const c = setCookies(res).find((x) => x.startsWith('jg_session='))!;
    const s = await open<Session>(SECRET, 'jg_session', c.split(';')[0].slice('jg_session='.length));
    expect(s?.at).toBe('ya29.NEW');
    expect(s?.rt).toBe(RT);
  });

  it('expired refresh token (invalid_grant) → 401 REAUTH and the cookie is cleared', async () => {
    google = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const res = await handleApi(req('/api/yt/playlists', { cookie: await sessionCookie({ exp: 0 }) }), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'REAUTH' });
    expect(setCookies(res)).toContain('jg_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  });

  it('quotaExceeded → 429 QUOTA', async () => {
    google = () => Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
    const res = await handleApi(req('/api/yt/search?q=test', { cookie: await sessionCookie() }), env);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: 'QUOTA' });
  });

  it('search is rate-limited to one call per second per session', async () => {
    google = () => Response.json({ items: [] });
    const first = await handleApi(req('/api/yt/search?q=a&lang=th', { cookie: await sessionCookie() }), env);
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Quota-Units')).toBe('100');
    const updated = setCookies(first).find((c) => c.startsWith('jg_session='))!.split(';')[0];
    const second = await handleApi(req('/api/yt/search?q=b', { cookie: updated }), env);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ code: 'SLOW_DOWN' });
  });

  it('search sends region TH and the UI language; decodes HTML entities; adds lengths, keeps every result (Shorts too)', async () => {
    const paths: string[] = [];
    google = (url) => {
      paths.push(url.pathname);
      if (url.pathname === '/youtube/v3/videos') {
        // Lengths only (1 unit): the results are YouTube's, not changed (Developer Policies).
        expect(url.searchParams.get('part')).toBe('contentDetails');
        expect(url.searchParams.get('id')).toBe('M7lc1UVf-VE,aqz-KE-bpKQ');
        return Response.json({ items: [{ id: 'M7lc1UVf-VE', contentDetails: { duration: 'PT3M5S' } }, { id: 'aqz-KE-bpKQ', contentDetails: { duration: 'PT40S' } }] });
      }
      expect(url.searchParams.get('regionCode')).toBe('TH');
      expect(url.searchParams.get('relevanceLanguage')).toBe('th');
      expect(url.searchParams.get('type')).toBe('video');
      return Response.json({
        items: [
          { id: { videoId: 'M7lc1UVf-VE' }, snippet: { title: 'Tom &amp; Jerry&#39;s', channelTitle: 'A' } },
          { id: { videoId: 'aqz-KE-bpKQ' }, snippet: { title: 'Quick #shorts', channelTitle: 'B' } },
        ],
      });
    };
    const res = await handleApi(req('/api/yt/search?q=x&lang=th', { cookie: await sessionCookie() }), env);
    expect((await res.json()) as unknown).toEqual({
      items: [
        { videoId: 'M7lc1UVf-VE', title: "Tom & Jerry's", channel: 'A', thumb: '', duration: 185 },
        { videoId: 'aqz-KE-bpKQ', title: 'Quick #shorts', channel: 'B', thumb: '', duration: 40 },
      ],
    });
    expect(paths).toEqual(['/youtube/v3/search', '/youtube/v3/videos']);
    expect(res.headers.get('X-Quota-Units')).toBe('101');
  });

  it('chart by category: passes videoCategoryId; a category without a chart is an empty list', async () => {
    google = (url) => {
      expect(url.pathname).toBe('/youtube/v3/videos');
      expect(url.searchParams.get('chart')).toBe('mostPopular');
      expect(url.searchParams.get('regionCode')).toBe('TH');
      if (url.searchParams.get('videoCategoryId') === '29') {
        return Response.json({ error: { errors: [{ reason: 'videoChartNotFound' }] } }, { status: 400 });
      }
      expect(url.searchParams.get('videoCategoryId')).toBe('20');
      return Response.json({ items: [{ id: 'M7lc1UVf-VE', snippet: { title: 'Top game', channelTitle: 'G' } }] });
    };
    const cookie = await sessionCookie();
    const res = await handleApi(req('/api/yt/popular?category=20', { cookie }), env);
    expect(((await res.json()) as { items: { title: string }[] }).items[0].title).toBe('Top game');
    const none = await handleApi(req('/api/yt/popular?category=29', { cookie }), env);
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ items: [] });
    const bad = await handleApi(req('/api/yt/popular?category=abc', { cookie }), env);
    expect(bad.status).toBe(400);
  });

  it('Trending hides Shorts (<= 60 s, or <= 3 min tagged #shorts) and adds durations', async () => {
    google = (url) => {
      expect(url.searchParams.get('part')).toBe('snippet,contentDetails');
      return Response.json({
        items: [
          { id: 'aaaaaaaaaaa', snippet: { title: 'Song', channelTitle: 'A' }, contentDetails: { duration: 'PT3M30S' } },
          { id: 'bbbbbbbbbbb', snippet: { title: 'Quick one', channelTitle: 'B' }, contentDetails: { duration: 'PT45S' } },
          { id: 'ccccccccccc', snippet: { title: 'Dance #shorts', channelTitle: 'C' }, contentDetails: { duration: 'PT2M10S' } },
          { id: 'ddddddddddd', snippet: { title: 'Live now', channelTitle: 'D' }, contentDetails: { duration: 'P0D' } },
        ],
      });
    };
    const res = await handleApi(req('/api/yt/popular', { cookie: await sessionCookie() }), env);
    const body = (await res.json()) as { items: { videoId: string; duration?: number }[] };
    expect(body.items.map((v) => [v.videoId, v.duration])).toEqual([['aaaaaaaaaaa', 210], ['ddddddddddd', 0]]);
  });

  it('categories: Thai titles via hl, only assignable ones', async () => {
    google = (url) => {
      expect(url.pathname).toBe('/youtube/v3/videoCategories');
      expect(url.searchParams.get('regionCode')).toBe('TH');
      expect(url.searchParams.get('hl')).toBe('th');
      return Response.json({
        items: [
          { id: '10', snippet: { title: 'เพลง', assignable: true } },
          { id: '18', snippet: { title: 'Short Movies', assignable: false } },
        ],
      });
    };
    const res = await handleApi(req('/api/yt/categories?lang=th', { cookie: await sessionCookie() }), env);
    expect(await res.json()).toEqual({ items: [{ id: '10', title: 'เพลง' }] });
  });

  it('requires a session', async () => {
    const res = await handleApi(req('/api/yt/liked'), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'NOT_CONNECTED' });
  });

  it('validates ids', async () => {
    const res = await handleApi(req('/api/yt/playlist-items?id=../../etc', { cookie: await sessionCookie() }), env);
    expect(res.status).toBe(400);
  });
});

describe('logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    let revoked = '';
    google = (url, init) => {
      expect(url.href).toBe('https://oauth2.googleapis.com/revoke');
      revoked = new URLSearchParams(String(init.body)).get('token') ?? '';
      return new Response(null, { status: 200 });
    };
    const res = await handleApi(req('/api/auth/logout', { method: 'POST', headers: { Origin: ORIGIN }, cookie: await sessionCookie() }), env);
    expect(res.status).toBe(200);
    expect(revoked).toBe(RT);
    expect(setCookies(res)).toContain('jg_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  });

  it('rejects cross-site logout (CSRF)', async () => {
    const res = await handleApi(req('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example' }, cookie: await sessionCookie() }), env);
    expect(res.status).toBe(403);
  });

  it('GET is not allowed', async () => {
    const res = await handleApi(req('/api/auth/logout'), env);
    expect(res.status).toBe(405);
  });
});

describe('configuration', () => {
  it('503 when secrets are missing; /me reports it with 200', async () => {
    const res = await handleApi(req('/api/yt/liked'), { ...env, SESSION_SECRET: undefined });
    expect(res.status).toBe(503);
    const me = await handleApi(req('/api/auth/me'), { ...env, GOOGLE_CLIENT_SECRET: undefined });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ connected: false, configured: false });
  });
  it('404 for unknown API paths', async () => {
    const res = await handleApi(req('/api/nope'), env);
    expect(res.status).toBe(404);
  });
});
