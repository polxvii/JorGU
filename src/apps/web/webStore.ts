// Transient Web app state per instance (not persisted): reload requests and "view changed, reload?" flags.
import { create } from 'zustand';
import type { WebInstanceId } from '../../features/settings/types';

interface WebUiState {
  reloadNonce: Partial<Record<WebInstanceId, number>>;
  /** The view mode changed since the page loaded: some sites only pick their layout at load (§9.7). */
  viewPending: Partial<Record<WebInstanceId, boolean>>;
  reload: (id: WebInstanceId) => void;
  setViewPending: (id: WebInstanceId, pending: boolean) => void;
}

export const useWebUi = create<WebUiState>()((set) => ({
  reloadNonce: {},
  viewPending: {},
  reload: (id) =>
    set((s) => ({ reloadNonce: { ...s.reloadNonce, [id]: (s.reloadNonce[id] ?? 0) + 1 }, viewPending: { ...s.viewPending, [id]: false } })),
  setViewPending: (id, pending) => set((s) => (!!s.viewPending[id] === pending ? s : { viewPending: { ...s.viewPending, [id]: pending } })),
}));
