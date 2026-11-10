// Would a browser let APP_ORIGIN frame this response? (spec §9.3). Follows CSP Level 3 frame-ancestors and the
// HTML standard's X-Frame-Options processing: when any enforced policy has frame-ancestors, X-Frame-Options is ignored.

export type Decision = { status: 'allowed' | 'blocked'; reason: string };

const DEFAULT_PORT: Record<string, string> = { 'https:': '443', 'http:': '80' };

/** Does one frame-ancestors source expression match the app's origin? `site` is the framed page's origin. */
export function sourceMatches(expr: string, app: URL, site: URL): boolean {
  const e = expr.trim();
  const lower = e.toLowerCase();
  if (lower === "'self'") return app.origin === site.origin;
  if (lower === '*') return app.protocol === 'https:' || app.protocol === 'http:';
  if (lower.startsWith("'")) return false; // 'none', nonces, hashes, keywords
  // scheme-source: "https:"; "http:" also matches https (CSP3 upgrade rule).
  const scheme = /^([a-z][a-z0-9+.-]*):$/.exec(lower);
  if (scheme) return `${scheme[1]}:` === app.protocol || (scheme[1] === 'http' && app.protocol === 'https:');
  // host-source: [scheme://]host[:port][/path]
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\*|\d+))?(?:\/.*)?$/.exec(lower);
  if (!m) return false;
  const [, srcScheme, host, port] = m;
  if (srcScheme) {
    if (!(`${srcScheme}:` === app.protocol || (srcScheme === 'http' && app.protocol === 'https:'))) return false;
  } else if (!(app.protocol === site.protocol || (site.protocol === 'http:' && app.protocol === 'https:'))) {
    return false;
  }
  const appHost = app.hostname.toLowerCase();
  if (host === '*') {
    // any host
  } else if (host.startsWith('*.')) {
    if (!appHost.endsWith(host.slice(1))) return false;
  } else if (host !== appHost) {
    return false;
  }
  const appPort = app.port || DEFAULT_PORT[app.protocol];
  if (port && port !== '*') return port === appPort;
  // No port: the scheme's default port (an http: source with no port also allows https on 443).
  const expected = srcScheme ? DEFAULT_PORT[`${srcScheme}:`] : DEFAULT_PORT[site.protocol];
  return appPort === expected || (expected === '80' && appPort === '443');
}

/** frame-ancestors directive values of every enforced CSP (header values may hold several comma-joined policies). */
export function frameAncestors(csp: string | null): string[][] {
  if (!csp) return [];
  const lists: string[][] = [];
  for (const policy of csp.split(',')) {
    for (const directive of policy.split(';')) {
      const parts = directive.trim().split(/\s+/).filter(Boolean);
      if (parts.length && parts[0].toLowerCase() === 'frame-ancestors') {
        lists.push(parts.slice(1));
        break; // a repeated directive in the same policy is ignored
      }
    }
  }
  return lists;
}

/** Framing decision from response headers, or null when neither header is present. */
export function framingDecision(headers: Headers, appOrigin: string, siteUrl: URL): Decision | null {
  const app = new URL(appOrigin);
  const lists = frameAncestors(headers.get('content-security-policy'));
  if (lists.length) {
    for (const list of lists) {
      if (list.length === 0 || (list.length === 1 && list[0].toLowerCase() === "'none'")) return { status: 'blocked', reason: 'csp-none' };
      if (!list.some((src) => sourceMatches(src, app, siteUrl))) return { status: 'blocked', reason: 'csp-mismatch' };
    }
    return { status: 'allowed', reason: 'csp-allows' };
  }
  const raw = headers.get('x-frame-options');
  if (raw === null) return null;
  const values = new Set(raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean));
  if (values.size > 1) {
    return [...values].some((v) => v === 'deny' || v === 'sameorigin' || v === 'allowall')
      ? { status: 'blocked', reason: 'xfo-conflict' }
      : { status: 'allowed', reason: 'xfo-invalid' };
  }
  const v = [...values][0];
  if (v === 'deny') return { status: 'blocked', reason: 'xfo-deny' };
  if (v === 'sameorigin') return app.origin === siteUrl.origin ? { status: 'allowed', reason: 'xfo-sameorigin' } : { status: 'blocked', reason: 'xfo-sameorigin' };
  return { status: 'allowed', reason: 'xfo-invalid' };
}
