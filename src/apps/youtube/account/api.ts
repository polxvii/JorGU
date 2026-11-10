// Client for the Worker API (spec §8.1–8.2). Same-origin cookie only: the browser never sees a token.
import { addUnits, markQuotaExhausted } from './quota';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

type AuthLost = (code: 'REAUTH' | 'NOT_CONNECTED') => void;
let onAuthLost: AuthLost = () => {};

/** The account store registers here (avoids an import cycle). */
export function setAuthLostHandler(fn: AuthLost): void {
  onAuthLost = fn;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...init.headers } });
  } catch {
    throw new ApiError('OFFLINE');
  }
  // No Worker behind /api (local `vite dev` / `vite preview`): the SPA fallback answers with HTML.
  if (!(res.headers.get('Content-Type') ?? '').includes('json')) throw new ApiError('NOT_CONFIGURED', res.status);
  const units = Number(res.headers.get('X-Quota-Units'));
  if (units > 0) addUnits(units);
  const body = (await res.json().catch(() => ({}))) as { code?: unknown };
  if (!res.ok) {
    const code = typeof body.code === 'string' ? body.code : 'HTTP';
    if (res.status === 401 && (code === 'REAUTH' || code === 'NOT_CONNECTED')) onAuthLost(code);
    if (code === 'QUOTA') markQuotaExhausted();
    throw new ApiError(code, res.status);
  }
  return body as T;
}
