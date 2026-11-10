// JorGu Worker: /api/* (OAuth + YouTube Data API proxy, spec §8.1–8.2); everything else is static assets.
// Tokens live only in the encrypted jg_session cookie and are never returned or logged.
import { open, randomToken, seal } from './lib/crypto';
import { type Env, authEnv } from './lib/env';
import { authorizationUrl, exchangeCode, pkceChallenge, profileFromIdToken, revokeToken } from './lib/google';
import { HttpError, assertSameOrigin, clearCookie, cookie, json, readCookie, redirect } from './lib/http';
import { STATE_COOKIE, SessionContext } from './lib/session';
import * as yt from './lib/yt';

export type { Env };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const SEARCH_GAP_MS = 1000;
const STATE_MAX_AGE = 600;

/** Reports only whether SESSION_SECRET is usable (32 bytes, base64) — never its value. */
function sessionSecretStatus(value: string | undefined): string {
  if (!value) return 'missing';
  try {
    const n = atob(value.trim()).length;
    return n === 32 ? 'ok' : `wrong-length:${n}`;
  } catch {
    return 'invalid-base64';
  }
}

function health(env: Env): Response {
  return json({
    ok: true,
    app: 'jorgu',
    milestone: 'M2',
    // Presence only; values are never returned or logged.
    config: {
      clientId: !!env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET ? 'set' : 'missing',
      sessionSecret: sessionSecretStatus(env.SESSION_SECRET),
      redirectUri: env.OAUTH_REDIRECT_URI ?? null,
    },
  });
}

type Handler = (req: Request, url: URL, ctx: SessionContext, env: NonNullable<ReturnType<typeof authEnv>>) => Promise<Response>;

const items = (list: unknown[]) => json({ items: list });

const routes: Record<string, { method: 'GET' | 'POST'; handler: Handler }> = {
  '/api/auth/login': {
    method: 'GET',
    handler: async (_req, _url, _ctx, env) => {
      const state = randomToken();
      const verifier = randomToken(48);
      const sealed = await seal(env.sessionSecret, STATE_COOKIE, { state, v: verifier, t: Date.now() });
      return redirect(authorizationUrl(env, state, await pkceChallenge(verifier)), [cookie(STATE_COOKIE, sealed, { maxAge: STATE_MAX_AGE, path: '/api/auth' })]);
    },
  },
  '/api/auth/callback': {
    method: 'GET',
    handler: async (req, url, ctx, env) => {
      const clearState = clearCookie(STATE_COOKIE, '/api/auth');
      if (url.searchParams.get('error')) return redirect('/?yt=denied', [clearState]);
      const raw = readCookie(req, STATE_COOKIE);
      const stored = raw ? await open<{ state: string; v: string; t: number }>(env.sessionSecret, STATE_COOKIE, raw) : null;
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      if (!stored || !state || stored.state !== state || Date.now() - stored.t > STATE_MAX_AGE * 1000 || !code) {
        return redirect('/?yt=error&reason=state', [clearState]);
      }
      try {
        const t = await exchangeCode(env, code, stored.v);
        if (!t.refresh_token) return redirect('/?yt=error&reason=norefresh', [clearState]);
        const p = profileFromIdToken(t.id_token);
        ctx.set({ v: 1, rt: t.refresh_token, at: t.access_token, exp: Date.now() + t.expires_in * 1000, ...p });
        return redirect('/?yt=connected', [...(await ctx.cookies()), clearState]);
      } catch {
        return redirect('/?yt=error&reason=token', [clearState]);
      }
    },
  },
  '/api/auth/logout': {
    method: 'POST',
    handler: async (req, _url, ctx, env) => {
      assertSameOrigin(req, env.appOrigin);
      if (ctx.session) await revokeToken(ctx.session.rt);
      ctx.clear();
      return json({ ok: true });
    },
  },
  '/api/auth/me': {
    method: 'GET',
    handler: async (_req, _url, ctx) => {
      const s = ctx.session;
      return json(s ? { connected: true, email: s.email, name: s.name, picture: s.picture } : { connected: false });
    },
  },
  '/api/yt/feed': {
    method: 'GET',
    handler: async (_req, url, ctx) => items(await yt.feed(ctx, Number(url.searchParams.get('limit') ?? 40) || 40)),
  },
  '/api/yt/subscriptions': {
    method: 'GET',
    handler: async (_req, _url, ctx) => items(await yt.subscriptions(ctx)),
  },
  '/api/yt/playlists': {
    method: 'GET',
    handler: async (_req, _url, ctx) => items(await yt.playlists(ctx)),
  },
  '/api/yt/playlist-items': {
    method: 'GET',
    handler: async (_req, url, ctx) => {
      const id = url.searchParams.get('id') ?? '';
      if (!PLAYLIST_ID.test(id)) throw new HttpError(400, 'BAD_ID');
      return items(await yt.playlistItems(ctx, id));
    },
  },
  '/api/yt/liked': {
    method: 'GET',
    handler: async (_req, _url, ctx) => items(await yt.liked(ctx)),
  },
  '/api/yt/popular': {
    method: 'GET',
    handler: async (_req, url, ctx) => items(await yt.popular(ctx, url.searchParams.get('music') === '1')),
  },
  '/api/yt/search': {
    method: 'GET',
    handler: async (_req, url, ctx) => {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
      if (!q) throw new HttpError(400, 'EMPTY_QUERY');
      const s = await ctx.require();
      const now = Date.now();
      if (s.lastSearch && now - s.lastSearch < SEARCH_GAP_MS) throw new HttpError(429, 'SLOW_DOWN');
      ctx.update({ lastSearch: now });
      return items(await yt.search(ctx, q, url.searchParams.get('lang') ?? 'en'));
    },
  },
  '/api/yt/videos': {
    method: 'GET',
    handler: async (_req, url, ctx) => {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter((id) => VIDEO_ID.test(id));
      return items(await yt.videos(ctx, ids));
    },
  },
};

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/api/health') return health(env);
  const route = routes[url.pathname];
  if (!route) return json({ code: 'NOT_FOUND' }, 404);
  if (req.method !== route.method) return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  const ae = authEnv(env, req);
  // /me is a status call: report "not configured" instead of failing, so the app can say so quietly.
  if (!ae) return url.pathname === '/api/auth/me' ? json({ connected: false, configured: false }) : json({ code: 'NOT_CONFIGURED' }, 503);

  const ctx = await SessionContext.load(req, ae);
  let res: Response;
  try {
    res = await route.handler(req, url, ctx, ae);
  } catch (e) {
    if (e instanceof HttpError) res = json({ code: e.code, ...e.extra }, e.status);
    else {
      console.error(`api error on ${url.pathname}: ${(e as Error)?.message ?? 'unknown'}`);
      res = json({ code: 'INTERNAL' }, 500);
    }
  }
  // Redirect responses already carry their cookies; everything else gets the session update here.
  if (res.status !== 302) {
    res = new Response(res.body, res);
    for (const c of await ctx.cookies()) res.headers.append('Set-Cookie', c);
    // Data API units spent on this request; the client sums them per Pacific day for "searches left" (§8.2).
    if (ctx.units > 0) res.headers.set('X-Quota-Units', String(ctx.units));
  }
  return res;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
