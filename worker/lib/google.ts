// Google OAuth 2.0 web-server flow (spec §8.1). Tokens never leave the Worker.
import type { AuthEnv } from './env';
import { b64urlDecode, b64urlEncode } from './crypto';
import { HttpError } from './http';

export const SCOPES = 'openid email profile https://www.googleapis.com/auth/youtube.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** PKCE S256 challenge for a verifier (RFC 7636). */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authorizationUrl(env: AuthEnv, state: string, codeChallenge: string): string {
  const p = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${p}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok) {
    // invalid_grant: refresh token expired (7-day Testing limit) or revoked → user must reconnect.
    if (data.error === 'invalid_grant') throw new HttpError(401, 'REAUTH');
    throw new HttpError(502, 'TOKEN_ERROR', { reason: data.error ?? res.status });
  }
  return data;
}

export function exchangeCode(env: AuthEnv, code: string, codeVerifier: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    code_verifier: codeVerifier,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    grant_type: 'authorization_code',
  });
}

export function refreshAccessToken(env: AuthEnv, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'refresh_token',
  });
}

/** Best effort: the session cookie is cleared either way. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Profile {
  email: string;
  name: string;
  picture: string;
}

/** The id_token comes straight from Google's token endpoint over TLS, so its claims are read without re-verifying. */
export function profileFromIdToken(idToken: string | undefined): Profile {
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken!.split('.')[1]))) as Partial<Profile>;
    return { email: payload.email ?? '', name: payload.name ?? '', picture: payload.picture ?? '' };
  } catch {
    return { email: '', name: '', picture: '' };
  }
}
