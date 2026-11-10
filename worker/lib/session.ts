// Encrypted session cookie `jg_session` (spec §8.1): httpOnly, Secure, SameSite=Lax, 180 days.
import type { AuthEnv } from './env';
import { open, seal } from './crypto';
import { HttpError, clearCookie, cookie, readCookie } from './http';
import { refreshAccessToken } from './google';

export const SESSION_COOKIE = 'jg_session';
export const STATE_COOKIE = 'jg_oauth';
const SESSION_MAX_AGE = 180 * 24 * 3600;

export interface Session {
  v: 1;
  rt: string;
  at: string;
  /** Access-token expiry, epoch ms */
  exp: number;
  email: string;
  name: string;
  picture: string;
  /** Last search.list call, epoch ms (rate limit §15) */
  lastSearch?: number;
}

/** Per-request session state; the router turns it into Set-Cookie headers. */
export class SessionContext {
  session: Session | null = null;
  /** Data API quota units used by this request. */
  units = 0;
  private changed = false;
  private cleared = false;

  constructor(private readonly env: AuthEnv) {}

  static async load(req: Request, env: AuthEnv): Promise<SessionContext> {
    const ctx = new SessionContext(env);
    const raw = readCookie(req, SESSION_COOKIE);
    if (raw) {
      const s = await open<Session>(env.sessionSecret, SESSION_COOKIE, raw);
      if (s && s.v === 1 && s.rt) ctx.session = s;
      else ctx.cleared = true; // unreadable cookie (e.g. secret rotated)
    }
    return ctx;
  }

  set(session: Session): void {
    this.session = session;
    this.changed = true;
    this.cleared = false;
  }

  update(patch: Partial<Session>): void {
    if (!this.session) return;
    this.session = { ...this.session, ...patch };
    this.changed = true;
  }

  clear(): void {
    this.session = null;
    this.cleared = true;
    this.changed = false;
  }

  /** Requires a session; refreshes the access token if it expires within 60 s. */
  async require(): Promise<Session> {
    if (!this.session) throw new HttpError(401, 'NOT_CONNECTED');
    if (this.session.exp - 60_000 < Date.now()) await this.refresh();
    return this.session!;
  }

  async refresh(): Promise<void> {
    if (!this.session) throw new HttpError(401, 'NOT_CONNECTED');
    try {
      const t = await refreshAccessToken(this.env, this.session.rt);
      this.update({ at: t.access_token, exp: Date.now() + t.expires_in * 1000, rt: t.refresh_token ?? this.session.rt });
    } catch (e) {
      if (e instanceof HttpError && e.code === 'REAUTH') this.clear();
      throw e;
    }
  }

  async cookies(): Promise<string[]> {
    if (this.cleared) return [clearCookie(SESSION_COOKIE)];
    if (this.changed && this.session) {
      return [cookie(SESSION_COOKIE, await seal(this.env.sessionSecret, SESSION_COOKIE, this.session), { maxAge: SESSION_MAX_AGE })];
    }
    return [];
  }
}
