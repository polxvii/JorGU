// JorGu Worker: serves /api/* (OAuth and YouTube proxy arrive in M2, frame-check in M5); everything else is static assets.
export interface Env {
  ASSETS: Fetcher;
  APP_ORIGIN?: string;
  OAUTH_REDIRECT_URI?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

const API_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json(
        {
          ok: true,
          app: 'jorgu',
          milestone: 'M1',
          // Presence only; values are never returned or logged.
          config: {
            clientId: !!env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET ? 'set' : 'missing',
            sessionSecret: sessionSecretStatus(env.SESSION_SECRET),
            redirectUri: env.OAUTH_REDIRECT_URI ?? null,
          },
        },
        { headers: API_HEADERS },
      );
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404, headers: API_HEADERS });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
