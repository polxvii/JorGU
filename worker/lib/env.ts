export interface Env {
  ASSETS: Fetcher;
  APP_ORIGIN?: string;
  OAUTH_REDIRECT_URI?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

/** Env with the OAuth values checked to be present. */
export interface AuthEnv {
  appOrigin: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
}

export function authEnv(env: Env, req: Request): AuthEnv | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) return null;
  const origin = new URL(req.url).origin;
  return {
    appOrigin: env.APP_ORIGIN ?? origin,
    redirectUri: env.OAUTH_REDIRECT_URI ?? `${origin}/api/auth/callback`,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
  };
}
