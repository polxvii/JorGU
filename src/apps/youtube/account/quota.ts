// Data API quota estimate (spec §8.2): the Worker reports units per request in X-Quota-Units; the client sums
// them per Pacific day (Google resets quota at midnight Pacific time). Default project quota 10,000 units/day;
// one search.list call = 100 units, plus 1 for the results' lengths (videos.list, 2026-11-13).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const DAILY_UNITS = 10_000;
export const SEARCH_UNITS = 101;

export function pacificDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface QuotaState {
  day: string;
  units: number;
}

export const useQuota = create<QuotaState>()(
  persist(() => ({ day: pacificDay(), units: 0 }), {
    name: 'jorgu:quota',
    version: 1,
    storage: createJSONStorage(() => localStorage),
  }),
);

export function addUnits(n: number, now: Date = new Date()): void {
  const s = useQuota.getState();
  const day = pacificDay(now);
  useQuota.setState({ day, units: (s.day === day ? s.units : 0) + n });
}

export function markQuotaExhausted(now: Date = new Date()): void {
  useQuota.setState({ day: pacificDay(now), units: DAILY_UNITS });
}

export function searchesLeft(s: QuotaState = useQuota.getState(), now: Date = new Date()): number {
  const units = s.day === pacificDay(now) ? s.units : 0;
  return Math.max(0, Math.floor((DAILY_UNITS - units) / SEARCH_UNITS));
}

export function useSearchesLeft(): number {
  return useQuota((s) => searchesLeft(s));
}
