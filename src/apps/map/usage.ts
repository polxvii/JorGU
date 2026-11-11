// Cost rule (spec §7.1, user decisions 2026-11-10/11, binding): JorGu must never cost money. Each billed SKU (map
// loads, routes) stays under its 10,000/month free tier: at most 320 a day (320 x 31 = 9,920). Past that, or when
// Google refuses a request, JorGu uses mode B (Embed, no charge). Counted per device in localStorage; the hard guard
// is the same 320/day quota cap in Cloud Console (Google has no monthly cap).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Same as the per-day cap set in Cloud Console. */
export const DAILY_CAP = 320;
/** 31 days at the daily cap: 9,920, below the 10,000 free per month. */
export const MONTHLY_CAP = DAILY_CAP * 31;
export type Sku = 'map' | 'route';

/** Google bills by calendar month in Pacific time. */
export function pacificMonth(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

/** Quota caps in Cloud Console reset at midnight Pacific time. */
export function pacificDay(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

interface UsageState {
  month: string;
  map: number;
  route: number;
  day: string;
  dayMap: number;
  dayRoute: number;
  /** Day (Pacific) on which Google refused a request (quota/auth): mode B until the next day. */
  refusedDay: string | null;
  refusedReason: string | null;
  record: (sku: Sku, now?: number) => void;
  markRefused: (reason: string, now?: number) => void;
}

export const useMapUsage = create<UsageState>()(
  persist(
    (set) => ({
      month: pacificMonth(),
      map: 0,
      route: 0,
      day: pacificDay(),
      dayMap: 0,
      dayRoute: 0,
      refusedDay: null,
      refusedReason: null,
      record: (sku, now = Date.now()) =>
        set((s) => {
          const month = pacificMonth(now);
          const day = pacificDay(now);
          const m = s.month === month ? s : { map: 0, route: 0 };
          const d = s.day === day ? s : { dayMap: 0, dayRoute: 0 };
          return sku === 'map'
            ? { month, day, map: m.map + 1, route: m.route, dayMap: d.dayMap + 1, dayRoute: d.dayRoute }
            : { month, day, map: m.map, route: m.route + 1, dayMap: d.dayMap, dayRoute: d.dayRoute + 1 };
        }),
      markRefused: (refusedReason, now = Date.now()) => set({ refusedDay: pacificDay(now), refusedReason }),
    }),
    {
      name: 'jorgu:mapUsage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ month, map, route, day, dayMap, dayRoute, refusedDay, refusedReason }) => ({ month, map, route, day, dayMap, dayRoute, refusedDay, refusedReason }),
    },
  ),
);

/** Events used this month (0 after the month changes). */
export function usedThisMonth(sku: Sku, now = Date.now()): number {
  const s = useMapUsage.getState();
  return s.month === pacificMonth(now) ? s[sku] : 0;
}

export function usedToday(sku: Sku, now = Date.now()): number {
  const s = useMapUsage.getState();
  if (s.day !== pacificDay(now)) return 0;
  return sku === 'map' ? s.dayMap : s.dayRoute;
}

/** May JorGu spend one more billed event of `sku` now? Both the monthly and the daily cap must allow it. */
export function canSpend(sku: Sku, now = Date.now()): boolean {
  const s = useMapUsage.getState();
  if (s.refusedDay === pacificDay(now)) return false;
  return usedThisMonth(sku, now) < MONTHLY_CAP && usedToday(sku, now) < DAILY_CAP;
}
