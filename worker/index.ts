// JorGu Worker: serves /api/* (OAuth, YouTube proxy, frame-check arrive in M3/M5); everything else is static assets.
interface Env {
  ASSETS: Fetcher;
}

const API_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, app: 'jorgu', milestone: 'M1' }, { headers: API_HEADERS });
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404, headers: API_HEADERS });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
