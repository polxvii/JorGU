// M4 pure logic: the cost rule (320/day, 9,920/month; spec §7.1), route progress (§7.4), Maps URLs (§7.3).
import { beforeEach, describe, expect, it } from 'vitest';
import { mapsAppSchemeUrl, mapsNavigateUrl, withRecentDestination } from '../../src/apps/map/navigate';
import { aheadBearing, haversine, progress, projectNear, projectOnPath } from '../../src/apps/map/routeMath';
import { MONTHLY_CAPS, allowedToday, canSpend, daysLeftInMonth, pacificDay, pacificMonth, useMapUsage, usedThisMonth } from '../../src/apps/map/usage';
import {
  NOT_DRIVEN,
  barPieces,
  carryDriven,
  mergeAhead,
  sectionPlan,
  sectionsFromLegs,
  slicePath,
  slowStretches,
  trafficLevel,
  trafficMillisLeft,
  tripBar,
} from '../../src/apps/map/routeTraffic';

const zero = () => ({ map: 0, route: 0, traffic: 0 });

describe('cost rule: never past the free tier, unused days carry over (user 2026-11-13)', () => {
  beforeEach(() => useMapUsage.setState({ month: pacificMonth(), used: zero(), day: pacificDay(), today: zero(), refusedDay: null, refusedReason: null }));

  it('monthly caps: 1 % under each free tier (Dynamic Maps 10,000, Routes Essentials 10,000, Routes Pro 5,000)', () => {
    expect(MONTHLY_CAPS).toEqual({ map: 9900, route: 9900, traffic: 4950 });
  });

  it("today's share = what's left this month ÷ days left (today included)", () => {
    // 15 Nov 2026 noon UTC = 15 Nov in California: 16 days left of 30.
    const now = Date.UTC(2026, 10, 15, 20);
    expect(daysLeftInMonth(now)).toBe(16);
    expect(allowedToday('traffic', now)).toBe(Math.floor(4950 / 16));
    // 30 used before today: the rest is spread over the days left.
    useMapUsage.setState({ month: pacificMonth(now), used: { ...zero(), traffic: 30 }, day: pacificDay(now), today: zero() });
    expect(allowedToday('traffic', now)).toBe(Math.floor(4920 / 16));
    // Today's own use doesn't shrink today's share; it stops at it.
    for (let i = 0; i < allowedToday('traffic', now); i++) useMapUsage.getState().record('traffic', now);
    expect(canSpend('traffic', now)).toBe(false);
    expect(allowedToday('traffic', now)).toBe(Math.floor(4920 / 16));
    // A quiet day carries over: tomorrow may use more than an even share.
    const quiet = Date.UTC(2026, 10, 20, 20);
    useMapUsage.setState({ month: pacificMonth(quiet), used: { ...zero(), traffic: 100 }, day: pacificDay(quiet), today: zero() });
    expect(allowedToday('traffic', quiet)).toBe(Math.floor(4850 / 11));
    expect(allowedToday('traffic', quiet)).toBeGreaterThan(4950 / 30);
    // The last day may use everything left.
    const last = Date.UTC(2026, 10, 30, 20);
    useMapUsage.setState({ month: pacificMonth(last), used: { ...zero(), traffic: 4000 }, day: pacificDay(last), today: zero() });
    expect(allowedToday('traffic', last)).toBe(950);
  });

  it('months and days follow Pacific time (Google billing / quota reset)', () => {
    // 2026-11-01 05:00 UTC is still 31 Oct in California.
    expect(pacificMonth(Date.UTC(2026, 10, 1, 5))).toBe('2026-10');
    expect(pacificMonth(Date.UTC(2026, 10, 1, 9))).toBe('2026-11');
    expect(pacificDay(Date.UTC(2026, 10, 1, 5))).toBe('2026-10-31');
  });

  it('stops at the monthly cap, per SKU, and starts again next month', () => {
    const now = Date.UTC(2026, 10, 30, 20);
    useMapUsage.setState({ month: pacificMonth(now), used: { ...zero(), map: MONTHLY_CAPS.map - 1 }, day: pacificDay(now), today: zero() });
    expect(canSpend('map', now)).toBe(true);
    useMapUsage.getState().record('map', now);
    expect(usedThisMonth('map', now)).toBe(MONTHLY_CAPS.map);
    expect(canSpend('map', now)).toBe(false);
    expect(canSpend('route', now)).toBe(true);
    const nextMonth = Date.UTC(2026, 11, 2, 20);
    expect(canSpend('map', nextMonth)).toBe(true);
    useMapUsage.getState().record('route', nextMonth);
    expect(useMapUsage.getState()).toMatchObject({ month: '2026-12', used: { map: 0, route: 1, traffic: 0 } });
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

describe('traffic on the route, per section (Compute Routes Pro legs)', () => {
  // A straight 3 km road north.
  const path = [{ lat: 13.7, lng: 100.5 }, { lat: 13.727, lng: 100.5 }];

  it('splits the road ahead into equal sections (≤ 26, ≥ 150 m), waypoints carry the road heading', () => {
    const plan = sectionPlan(path, 0)!;
    expect(plan.bounds).toHaveLength(21); // 3 km / 150 m = 20 sections
    expect(plan.intermediates).toHaveLength(19);
    expect(plan.origin.heading).toBe(0);
    expect(plan.intermediates.every((p) => p.heading === 0)).toBe(true);
    const far = sectionPlan([{ lat: 13.7, lng: 100.5 }, { lat: 13.9, lng: 100.5 }], 0)!;
    expect(far.intermediates).toHaveLength(25);
    // From the car's place on the route; nothing when almost there.
    expect(sectionPlan(path, 1500)!.bounds[0]).toBe(1500);
    expect(sectionPlan(path, haversineTotal(path) - 100)).toBeNull();
  });

  it('colours from time in traffic ÷ time without; a leg that took another way is unknown', () => {
    const bounds = [0, 1000, 2000, 3000];
    const s = sectionsFromLegs(bounds, [
      { distanceMeters: 1000, durationMillis: 60_000, staticDurationMillis: 60_000 },
      { distanceMeters: 1010, durationMillis: 300_000, staticDurationMillis: 60_000 },
      { distanceMeters: 2500, durationMillis: 90_000, staticDurationMillis: 60_000 },
    ]);
    expect(s.map((x) => trafficLevel(x.ratio))).toEqual(['free', 'jam', 'unknown']);
    expect(trafficLevel(1.5)).toBe('slow');
    // Time left counts the current section in part.
    expect(trafficMillisLeft(s, 1500)).toBe(150_000 + 90_000);
    // A section that took another way counts at the route's own pace, not its detour's time.
    expect(trafficMillisLeft(s, 1500, 60)).toBe(150_000 + 1000 * 60);
    // The bar is the whole route (user 2026-11-13): start at the bottom (0), destination at the top (1); driven so far
    // is 'passed', the rest keeps its place, so the car's dot climbs towards a jam that stays put.
    // Behind the car every stretch keeps its colour, faded (user 2026-11-13); the jam is cut at the car.
    expect(barPieces(s, 1500, 3000)).toEqual([
      { from: 0, to: 1 / 3, level: 'free', passed: true },
      { from: 1 / 3, to: 0.5, level: 'jam', passed: true },
      { from: 0.5, to: 2 / 3, level: 'jam', passed: false },
      { from: 2 / 3, to: 1, level: 'unknown', passed: false },
    ]);
    expect(barPieces(s, 0, 3000).map((p) => `${p.level}${p.passed ? '-passed' : ''}`)).toEqual(['free', 'jam', 'unknown']);
  });
});

describe('the bar is the whole trip, from where the route was started (user 2026-11-18)', () => {
  const sec = (from: number, to: number, ratio: number) => ({ from, to, ratio, ms: (to - from) * 100 });
  const label = (p: { level: string; passed: boolean }) => `${p.level}${p.passed ? '-passed' : ''}`;

  it('a traffic refresh (road ahead only) keeps the colours of the stretch already driven', () => {
    const old = [sec(0, 1000, 1), sec(1000, 2000, 3), sec(2000, 3000, 1)];
    const fresh = [sec(1500, 2250, 1.5), sec(2250, 3000, 1)];
    const merged = mergeAhead(old, fresh);
    expect(merged.map((s) => [s.from, s.to, trafficLevel(s.ratio)])).toEqual([
      [0, 1000, 'free'],
      [1000, 1500, 'jam'],
      [1500, 2250, 'slow'],
      [2250, 3000, 'free'],
    ]);
    expect(merged[1].ms).toBe(50_000); // the jam cut at the car keeps its share of the time
    expect(barPieces(merged, 1500, 3000).map(label)).toEqual(['free-passed', 'jam-passed', 'slow', 'free']);
    expect(mergeAhead(undefined, fresh)).toEqual(fresh);
    expect(mergeAhead(old, [])).toEqual(old);
  });

  it('a new route from where the car is: the driven part stays at the bottom, the dot stays where it was', () => {
    const first = [sec(0, 1000, 1), sec(1000, 2000, 3), sec(2000, 3000, 1)];
    // Left the 3 km route at 1.5 km; the new line from there is 2 km.
    const driven = carryDriven(NOT_DRIVEN, first, 1500);
    expect(driven.meters).toBe(1500);
    expect(driven.sections.map((s) => [s.from, s.to])).toEqual([
      [0, 1000],
      [1000, 1500],
    ]);
    // Before the new line's traffic is known: the driven part only (the rest of the bar is unknown).
    let bar = tripBar(driven, [], 0, 2000);
    expect(bar).toMatchObject({ total: 3500, along: 1500 });
    expect(bar.pieces.map(label)).toEqual(['free-passed', 'jam-passed']);
    // Its traffic comes, on top of the driven part; 500 m further on the new line.
    bar = tripBar(driven, [sec(0, 2000, 1.5)], 500, 2000);
    expect(bar.along).toBe(2000);
    expect(bar.pieces.map((p) => [Math.round(p.from * 3500), Math.round(p.to * 3500), label(p)])).toEqual([
      [0, 1000, 'free-passed'],
      [1000, 1500, 'jam-passed'],
      [1500, 2000, 'slow-passed'],
      [2000, 3500, 'slow'],
    ]);
    // A second new route adds on.
    const again = carryDriven(driven, [sec(0, 2000, 1.5)], 500);
    expect(again.meters).toBe(2000);
    expect(again.sections.map((s) => [s.from, s.to])).toEqual([
      [0, 1000],
      [1000, 1500],
      [1500, 2000],
    ]);
  });

  it('a stretch no section covers is unknown, also behind the car', () => {
    expect(barPieces([sec(0, 1000, 1), sec(1500, 3000, 1)], 2000, 3000).map(label)).toEqual(['free-passed', 'unknown-passed', 'free-passed', 'free']);
  });
});

describe('the car stays on the stretch it is on (a route out to a U-turn and back, user 2026-11-18)', () => {
  // 1 km north, a U-turn 20 m east, 1 km back south on the other side, then 1 km east.
  const path = [
    { lat: 13.7, lng: 100.5 },
    { lat: 13.709, lng: 100.5 },
    { lat: 13.709, lng: 100.50019 },
    { lat: 13.7, lng: 100.50019 },
    { lat: 13.7, lng: 100.5095 },
  ];
  it('the pass nearest to where the car was wins, not the nearest side of the road', () => {
    // Going north, 222 m out, the GPS a little east: the way back is nearer.
    const out = { lat: 13.702, lng: 100.50011 };
    expect(projectOnPath(out, path).along).toBeGreaterThan(1500);
    expect(projectNear(out, path, 200).along).toBeCloseTo(222, -1);
    expect(Math.round(aheadBearing(out, path, 200)!)).toBe(0); // the map turns north, not south
    // Coming back, the GPS a little west: the way out is nearer.
    const back = { lat: 13.702, lng: 100.50008 };
    expect(projectOnPath(back, path).along).toBeLessThan(500);
    expect(projectNear(back, path, 1700).along).toBeGreaterThan(1500);
    // No hint (first fix): the nearest point.
    expect(projectNear(out, path, null)).toEqual(projectOnPath(out, path));
  });
});

describe('slow / jammed stretches on the route line', () => {
  const path = [{ lat: 13.7, lng: 100.5 }, { lat: 13.709, lng: 100.5 }, { lat: 13.718, lng: 100.5 }, { lat: 13.727, lng: 100.5 }];
  it('cuts the route exactly at the section ends and merges neighbours of the same level', () => {
    const cut = slicePath(path, 500, 1500);
    expect(haversine(path[0], cut[0])).toBeCloseTo(500, 0);
    expect(haversine(path[0], cut[cut.length - 1])).toBeCloseTo(1500, 0);
    expect(cut).toHaveLength(3); // the corner at ~1 km is kept
    const sections = [0, 600, 1200, 1800, 2400, 3000].slice(0, -1).map((from, i) => ({ from, to: from + 600, ms: 1, ratio: [1, 3, 2.5, 1.5, 1][i] }));
    const s = slowStretches(path, sections);
    expect(s.map((x) => x.level)).toEqual(['jam', 'slow']);
    expect(haversine(path[0], s[0].path[0])).toBeCloseTo(600, 0);
    expect(haversine(path[0], s[0].path[s[0].path.length - 1])).toBeCloseTo(1800, 0);
  });
});

function haversineTotal(p: { lat: number; lng: number }[]) {
  return haversine(p[0], p[1]);
}

