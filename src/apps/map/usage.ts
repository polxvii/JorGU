// Cost rule (spec §7.1, user decisions 2026-11-10/11/13, binding): JorGu must never cost money. Each billed SKU
// stays under its free monthly use, less 1 %: map loads (Dynamic Maps, 10,000 free) 9,900; route lines (Compute
// Routes Essentials, 10,000 free) 9,900; traffic per section of the route (Compute Routes Pro, 5,000 free) 4,950.
// Unused days roll over (user 2026-11-13): today's allowance = what's left this month ÷ days left, today included.
// Past that, or when Google refuses a request, JorGu falls back (mode B / Embed directions / no traffic bar).
// Counted per device in localStorage. On a paid billing account the hard guard is the per-day quota in Cloud Console
// (see the setup guide); on the Free Trial nothing can be charged.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Sku = 'map' | 'route' | 'traffic';
export const SKUS: Sku[] = ['map', 'route', 'traffic'];

/** Free per month (Google), less 1 %. */
export const MONTHLY_CAPS: Record<Sku, number> = { map: 9_900, route: 9_900, traffic: 4_950 };

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

/** Days left in this (Pacific) month, today included. */
export function daysLeftInMonth(now = Date.now()): number {
  const [y, m, d] = pacificDay(now).split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days - d + 1;
}

type Counts = Record<Sku, number>;
const zero = (): Counts => ({ map: 0, route: 0, traffic: 0 });

interface UsageState {
  month: string;
  used: Counts;
  day: string;
  today: Counts;
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
      used: zero(),
      day: pacificDay(),
      today: zero(),
      refusedDay: null,
      refusedReason: null,
      record: (sku, now = Date.now()) =>
        set((s) => {
          const month = pacificMonth(now);
          const day = pacificDay(now);
          const used = s.month === month ? { ...zero(), ...s.used } : zero();
          const today = s.day === day ? { ...zero(), ...s.today } : zero();
          return { month, day, used: { ...used, [sku]: used[sku] + 1 }, today: { ...today, [sku]: today[sku] + 1 } };
        }),
      markRefused: (refusedReason, now = Date.now()) => set({ refusedDay: pacificDay(now), refusedReason }),
    }),
    {
      name: 'jorgu:mapUsage',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ month, used, day, today, refusedDay, refusedReason }) => ({ month, used, day, today, refusedDay, refusedReason }),
      // v1 kept map / route and dayMap / dayRoute as separate fields.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const n = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);
          return { ...p, used: { map: n('map'), route: n('route'), traffic: 0 }, today: { map: n('dayMap'), route: n('dayRoute'), traffic: 0 } };
        }
        return p;
      },
    },
  ),
);

/** Events used this month (0 after the month changes). */
export function usedThisMonth(sku: Sku, now = Date.now()): number {
  const s = useMapUsage.getState();
  return s.month === pacificMonth(now) ? (s.used?.[sku] ?? 0) : 0;
}

export function usedToday(sku: Sku, now = Date.now()): number {
  const s = useMapUsage.getState();
  return s.day === pacificDay(now) ? (s.today?.[sku] ?? 0) : 0;
}

/** Today's allowance: what was left at the start of today, spread over the days left (today included). */
export function allowedToday(sku: Sku, now = Date.now()): number {
  const leftAtStartOfDay = MONTHLY_CAPS[sku] - (usedThisMonth(sku, now) - usedToday(sku, now));
  return Math.max(0, Math.floor(leftAtStartOfDay / daysLeftInMonth(now)));
}

/** May JorGu spend one more billed event of `sku` now? Within this month's free use and today's share of it. */
export function canSpend(sku: Sku, now = Date.now()): boolean {
  const s = useMapUsage.getState();
  if (s.refusedDay === pacificDay(now)) return false;
  return usedThisMonth(sku, now) < MONTHLY_CAPS[sku] && usedToday(sku, now) < allowedToday(sku, now);
}
