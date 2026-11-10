// YouTube account state (spec §8.1). The client only knows {connected, email, name, picture}; tokens stay in the
// Worker's encrypted httpOnly cookie. Persisted here: the REAUTH flag (banner) and the privacy-consent time (§8.8).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MeResponse, Profile } from '../../../../shared/ytTypes';
import { ApiError, api, setAuthLostHandler } from './api';
import { clearAll } from './cache';

/** unknown = not checked yet or offline; unavailable = server has no OAuth config (e.g. local dev). */
export type AccountStatus = 'unknown' | 'disconnected' | 'connected' | 'unavailable';

export interface AccountState {
  status: AccountStatus;
  profile: Profile | null;
  /** Google said invalid_grant (7-day Testing expiry or revoked): show "Reconnect" until reconnect or dismiss. */
  expired: boolean;
  /** When the user agreed to the privacy policy by tapping Connect (epoch ms). */
  consentAt: number | null;
}

export const useAccount = create<AccountState>()(
  persist((): AccountState => ({ status: 'unknown', profile: null, expired: false, consentAt: null }), {
    name: 'jorgu:account',
    version: 1,
    storage: createJSONStorage(() => localStorage),
    partialize: ({ expired, consentAt }) => ({ expired, consentAt }),
  }),
);

setAuthLostHandler((code) => {
  useAccount.setState((s) => ({ status: 'disconnected', profile: null, expired: s.expired || code === 'REAUTH' }));
});

export async function refreshAccount(): Promise<AccountStatus> {
  try {
    const me = await api<MeResponse>('/api/auth/me');
    if (me.connected) {
      useAccount.setState({ status: 'connected', profile: { email: me.email, name: me.name, picture: me.picture }, expired: false });
    } else {
      useAccount.setState({ status: me.configured === false ? 'unavailable' : 'disconnected', profile: null });
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_CONFIGURED') useAccount.setState({ status: 'unavailable', profile: null });
    // OFFLINE: stay 'unknown'; the library still shows cached data.
  }
  return useAccount.getState().status;
}

/** Full-page redirect to Google (the Worker sets the state cookie). Tapping Connect = agreeing to the policy. */
export function connectAccount(): void {
  useAccount.setState({ consentAt: Date.now() });
  window.location.assign('/api/auth/login');
}

/** Revokes on Google's side, clears the cookie, deletes cached account data. False if the server wasn't reached. */
export async function disconnectAccount(): Promise<boolean> {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    return false;
  }
  await clearAll();
  useAccount.setState({ status: 'disconnected', profile: null, expired: false });
  return true;
}

export function dismissExpired(): void {
  useAccount.setState({ expired: false });
}
