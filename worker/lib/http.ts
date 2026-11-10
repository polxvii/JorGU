// Small HTTP helpers for the Worker API.

export const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers(SECURITY_HEADERS);
  h.set('Location', location);
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function cookie(name: string, value: string, opts: { maxAge: number; path?: string }): string {
  return `${name}=${value}; Path=${opts.path ?? '/'}; Max-Age=${opts.maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string, path = '/'): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** CSRF guard for state-changing requests: Origin (or Referer) must be our own origin. */
export function assertSameOrigin(req: Request, appOrigin: string): void {
  const origin = req.headers.get('Origin') ?? (req.headers.get('Referer') ? new URL(req.headers.get('Referer')!).origin : null);
  const own = new URL(req.url).origin;
  if (!origin || (origin !== own && origin !== appOrigin)) throw new HttpError(403, 'BAD_ORIGIN');
}
