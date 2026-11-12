// Two-edge route line (routeEdges.ts): edges a fixed number of screen pixels either side of the route, at any zoom.
import { describe, expect, it } from 'vitest';
import { type P, fromWorld, offsetLine, removeKnots, routeEdges, simplify, toWorld } from '../../src/apps/map/routeEdges';
import { type LL, haversine, metersPerPixel } from '../../src/apps/map/routeMath';

const dist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
/** Shortest distance from p to the polyline. */
const toLine = (p: P, line: P[]) => Math.min(...line.slice(1).map((b, i) => dist(p, line[i], b)));
const selfCrosses = (line: P[]) => {
  const cross = (a: P, b: P, c: P, d: P) => {
    const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < line.length - 1; i++) for (let j = i + 2; j < line.length - 1; j++) if (cross(line[i], line[i + 1], line[j], line[j + 1])) return true;
  return false;
};

describe('route edges', () => {
  it('world pixels round-trip and match Google metres per pixel', () => {
    const p: LL = { lat: 13.7563, lng: 100.5018 };
    const back = fromWorld(toWorld(p, 16), 16);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lng).toBeCloseTo(p.lng, 9);
    const w = toWorld(p, 16);
    const east = fromWorld({ x: w.x + 100, y: w.y }, 16);
    expect(haversine(p, east) / 100).toBeCloseTo(metersPerPixel(p.lat, 16), 2);
  });

  it('a straight road: one edge each side, the same distance away', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(offsetLine(line, 9)).toEqual([{ x: 0, y: 9 }, { x: 100, y: 9 }]); // right of travel (east) = screen down
    expect(offsetLine(line, -9).map((p) => p.y)).toEqual([-9, -9]);
  });

  it('a right-angle turn: a mitred corner, 9 px from both roads', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]; // east, then a right turn south
    const inside = offsetLine(line, 9);
    expect(inside[1].x).toBeCloseTo(91, 9);
    expect(inside[1].y).toBeCloseTo(9, 9);
    const outside = offsetLine(line, -9);
    expect(outside[1].x).toBeCloseTo(109, 9);
    expect(outside[1].y).toBeCloseTo(-9, 9);
    for (const p of [...inside, ...outside]) expect(toLine(p, line)).toBeGreaterThanOrEqual(9 - 1e-9);
  });

  it('a U-turn: the inside edge has no knot, the outside edge is bevelled, both stay clear of the road', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 6 }, { x: 0, y: 6 }];
    for (const d of [9, -9]) {
      const e = removeKnots(offsetLine(line, d), 72);
      expect(selfCrosses(e)).toBe(false);
      // Ends sit beside the road ends; nothing lands on the road.
      for (const p of [e[0], e[e.length - 1]]) expect(toLine(p, line)).toBeGreaterThan(2.9);
    }
  });

  it('a real loop in the route (a ramp circling round) keeps its edge', () => {
    const loop: P[] = [];
    for (let a = 0; a <= 400; a += 10) loop.push({ x: 60 * Math.cos((a * Math.PI) / 180), y: 60 * Math.sin((a * Math.PI) / 180) });
    const e = removeKnots(offsetLine(loop, 9), 72);
    expect(e.length).toBe(offsetLine(loop, 9).length);
  });

  it('simplify drops points on a straight line and keeps the corners', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0.2 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(simplify(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });

  it('routeEdges: both edges about the same metres from the route as the pixels asked for, on opposite sides', () => {
    const path: LL[] = [{ lat: 13.7563, lng: 100.5018 }, { lat: 13.7603, lng: 100.5018 }, { lat: 13.7603, lng: 100.5068 }];
    for (const zoom of [13, 16, 18]) {
      const [left, right] = routeEdges(path, zoom, 9);
      const m = 9 * metersPerPixel(path[0].lat, zoom);
      expect(haversine(left[0], path[0]) / m).toBeCloseTo(1, 2);
      expect(haversine(right[0], path[0]) / m).toBeCloseTo(1, 2);
      // Heading north: the left edge is west of the route, the right edge east.
      expect(left[0].lng).toBeLessThan(path[0].lng);
      expect(right[0].lng).toBeGreaterThan(path[0].lng);
    }
    expect(routeEdges([path[0]], 16, 9)).toEqual([[], []]);
  });
});
