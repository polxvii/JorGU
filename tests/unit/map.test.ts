// M4 pure logic: the cost rule (320/day, 9,920/month; spec §7.1), route progress (§7.4), Maps URLs (§7.3).
import { beforeEach, describe, expect, it } from 'vitest';
import { mapsAppSchemeUrl, mapsNavigateUrl, withRecentDestination } from '../../src/apps/map/navigate';
import { haversine, progress, projectOnPath } from '../../src/apps/map/routeMath';
import { DAILY_CAP, MONTHLY_CAP, canSpend, pacificDay, pacificMonth, useMapUsage, usedThisMonth } from '../../src/apps/map/usage';

describe('cost rule: never past the free tier (320 a day, 9,920 a month per SKU)', () => {
  beforeEach(() =>
    useMapUsage.setState({ month: pacificMonth(), map: 0, route: 0, day: pacificDay(), dayMap: 0, dayRoute: 0, refusedDay: null, refusedReason: null }),
  );

  it('stops at 320 a day (same as the Cloud Console cap: 320 x 31 = 9,920 < 10,000)', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    for (let i = 0; i < DAILY_CAP; i++) useMapUsage.getState().record('map', now);
    expect(canSpend('map', now)).toBe(false);
    expect(DAILY_CAP).toBe(320);
    expect(MONTHLY_CAP).toBe(9920);
    expect(DAILY_CAP * 31).toBeLessThan(10_000);
    expect(canSpend('map', now + 24 * 3600_000)).toBe(true);
  });

  it('months and days follow Pacific time (Google billing / quota reset)', () => {
    // 2026-11-01 05:00 UTC is still 31 Oct in California.
    expect(pacificMonth(Date.UTC(2026, 10, 1, 5))).toBe('2026-10');
    expect(pacificMonth(Date.UTC(2026, 10, 1, 9))).toBe('2026-11');
    expect(pacificDay(Date.UTC(2026, 10, 1, 5))).toBe('2026-10-31');
  });

  it('stops at the cap, per SKU, and starts again next month', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    useMapUsage.setState({ month: pacificMonth(now), map: MONTHLY_CAP - 1, route: 0, day: pacificDay(now), dayMap: 0 });
    expect(canSpend('map', now)).toBe(true);
    useMapUsage.getState().record('map', now);
    expect(usedThisMonth('map', now)).toBe(MONTHLY_CAP);
    expect(canSpend('map', now)).toBe(false);
    expect(canSpend('route', now)).toBe(true);
    const nextMonth = Date.UTC(2026, 11, 2, 12);
    expect(canSpend('map', nextMonth)).toBe(true);
    useMapUsage.getState().record('route', nextMonth);
    expect(useMapUsage.getState()).toMatchObject({ month: '2026-12', map: 0, route: 1 });
  });

  it('a refusal from Google switches to mode B for the rest of that (Pacific) day', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    useMapUsage.getState().markRefused('auth', now);
    expect(canSpend('map', now)).toBe(false);
    expect(canSpend('map', now + 24 * 3600_000)).toBe(true);
  });
});

describe('route overview geometry', () => {
  const A = { lat: 13.75, lng: 100.5 };
  const B = { lat: 13.85, lng: 100.5 }; // ~11.1 km north

  it('distances', () => {
    expect(haversine(A, B)).toBeGreaterThan(11000);
    expect(haversine(A, B)).toBeLessThan(11200);
  });

  it('projects onto the line and reports what is left', () => {
    const mid = { lat: 13.8, lng: 100.5005 };
    const p = projectOnPath(mid, [A, B]);
    expect(p.off).toBeLessThan(80);
    expect(p.along).toBeGreaterThan(5400);
    expect(p.along).toBeLessThan(5700);
    const left = progress(mid, [A, B], 12000, 20 * 60_000);
    expect(left.offRoute).toBe(false);
    expect(left.metersLeft).toBeGreaterThan(5800);
    expect(left.metersLeft).toBeLessThan(6200);
    expect(left.millisLeft).toBeGreaterThan(9 * 60_000);
    expect(left.millisLeft).toBeLessThan(11 * 60_000);
  });

  it('more than 200 m from the line is off route', () => {
    expect(progress({ lat: 13.8, lng: 100.51 }, [A, B], 12000, 1).offRoute).toBe(true);
  });
});

describe('Navigate hand-off (Maps URLs: no key, no cost)', () => {
  it('builds the documented URLs', () => {
    const u = new URL(mapsNavigateUrl(' สนามบินสุวรรณภูมิ '));
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
    expect(Object.fromEntries(u.searchParams)).toEqual({ api: '1', destination: 'สนามบินสุวรรณภูมิ', travelmode: 'driving', dir_action: 'navigate' });
    expect(mapsAppSchemeUrl('Central World')).toBe('comgooglemaps://?daddr=Central+World&directionsmode=driving');
  });

  it('recent destinations: newest first, no duplicates (case-insensitive), at most 10', () => {
    let r: string[] = [];
    for (let i = 0; i < 12; i++) r = withRecentDestination(r, `Place ${i}`);
    r = withRecentDestination(r, 'place 5');
    expect(r).toHaveLength(10);
    expect(r[0]).toBe('place 5');
    expect(r.filter((x) => x.toLowerCase() === 'place 5')).toHaveLength(1);
  });
});
