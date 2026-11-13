// Traffic on the route, per section (user 2026-11-13): the route line stays one solid line and a bar beside the map
// shows the road ahead green / orange / red. Source: one Compute Routes **Pro** request (traffic-aware, up to 25
// waypoints placed on our own route with the road's heading, so Google keeps the same route): each leg comes back
// with its time in traffic and its time without traffic. Their ratio is the section's traffic. No colours are read
// from the map (Terms §3.2.3(a)/(c)). Pure, so unit-tested.
import { type LL, bearing, haversine, pathLength, pointAlong } from './routeMath';

export const MAX_SECTIONS = 26; // 25 intermediate waypoints
export const MIN_SECTION_M = 150;

export interface DirectionalPoint extends LL {
  heading: number;
}

export interface SectionPlan {
  origin: DirectionalPoint;
  intermediates: DirectionalPoint[];
  destination: LL;
  /** Section edges, metres along the route: bounds[i]..bounds[i+1] is section i. */
  bounds: number[];
}

export interface TrafficSection {
  from: number;
  to: number;
  /** Time in traffic / time without traffic; NaN when the leg doesn't match our section (unknown). */
  ratio: number;
  ms: number;
}

export type TrafficLevel = 'free' | 'slow' | 'jam' | 'unknown';

export function trafficLevel(ratio: number): TrafficLevel {
  if (!Number.isFinite(ratio)) return 'unknown';
  if (ratio < 1.3) return 'free';
  if (ratio < 2) return 'slow';
  return 'jam';
}

/** The road's heading at `along` metres (a few metres ahead, so a waypoint snaps to the right carriageway). */
function headingAt(path: LL[], along: number): number {
  return Math.round(bearing(pointAlong(path, along), pointAlong(path, along + 15)));
}

/** Waypoints splitting the rest of the route (from `along`) into equal sections; null when too short to bother. */
export function sectionPlan(path: LL[], along: number): SectionPlan | null {
  if (path.length < 2) return null;
  const total = pathLength(path);
  const left = total - along;
  if (left < MIN_SECTION_M) return null;
  const n = Math.max(1, Math.min(MAX_SECTIONS, Math.floor(left / MIN_SECTION_M)));
  const bounds = Array.from({ length: n + 1 }, (_, i) => along + (left * i) / n);
  const at = (m: number): DirectionalPoint => ({ ...pointAlong(path, m), heading: headingAt(path, m) });
  return { origin: at(along), intermediates: bounds.slice(1, -1).map(at), destination: path[path.length - 1], bounds };
}

/** Sections from the legs Google returned (one per section, in order). */
export function sectionsFromLegs(
  bounds: number[],
  legs: { distanceMeters?: number; durationMillis?: number; staticDurationMillis?: number }[],
): TrafficSection[] {
  const out: TrafficSection[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const leg = legs[i];
    const expect = bounds[i + 1] - bounds[i];
    const ms = leg?.durationMillis ?? NaN;
    const st = leg?.staticDurationMillis ?? NaN;
    // A leg much longer or shorter than our section took another way (a detour to a waypoint): don't colour it.
    const fits = !!leg?.distanceMeters && Math.abs(leg.distanceMeters - expect) <= Math.max(60, expect * 0.35);
    out.push({ from: bounds[i], to: bounds[i + 1], ratio: fits && st > 0 ? ms / st : NaN, ms: Number.isFinite(ms) ? ms : 0 });
  }
  return out;
}

/**
 * Time left in traffic from `along` to the end (the current section counted in part). A section whose leg took
 * another way (unknown) would add its detour's time: it counts at `paceMsPerM` instead (the route's own pace in
 * traffic), when given. (Live 2026-11-13: one run showed 41 min for a 30 min route.)
 */
export function trafficMillisLeft(sections: TrafficSection[], along: number, paceMsPerM?: number): number {
  let ms = 0;
  for (const s of sections) {
    if (s.to <= along) continue;
    const share = s.from >= along ? 1 : (s.to - along) / (s.to - s.from || 1);
    const own = !Number.isFinite(s.ratio) && paceMsPerM ? (s.to - s.from) * paceMsPerM : s.ms;
    ms += own * share;
  }
  return ms;
}

export interface BarPiece {
  /** 0 = the start of the route (bottom of the bar), 1 = the destination (top). */
  from: number;
  to: number;
  level: TrafficLevel | 'passed';
}

/**
 * The whole route on the bar (user 2026-11-13): start at the bottom, destination at the top, the car's dot climbing
 * at `along / total`. Driven so far: 'passed'; ahead: the sections' traffic, so a jam stays where it is on the bar
 * while the dot moves towards it.
 */
export function barPieces(sections: TrafficSection[], along: number, total: number): BarPiece[] {
  if (total <= 0 || !sections.length) return [];
  const at = Math.max(0, Math.min(total, along));
  const out: BarPiece[] = [];
  const push = (from: number, to: number, level: BarPiece['level']) => {
    if (to - from < 1e-9) return;
    const prev = out[out.length - 1];
    if (prev && prev.level === level && Math.abs(prev.to - from) < 1e-9) prev.to = to;
    else out.push({ from, to, level });
  };
  push(0, at / total, 'passed');
  // Not covered by the sections yet (the car went back): unknown.
  if (sections[0].from > at) push(at / total, sections[0].from / total, 'unknown');
  for (const s of sections) {
    if (s.to <= at) continue;
    push(Math.max(s.from, at) / total, Math.min(1, s.to / total), trafficLevel(s.ratio));
  }
  return out;
}

/** The route between two distances along it (metres), cut exactly at both ends. */
export function slicePath(path: LL[], from: number, to: number): LL[] {
  const out: LL[] = [pointAlong(path, from)];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    walked += haversine(path[i - 1], path[i]);
    if (walked > from && walked < to) out.push(path[i]);
    if (walked >= to) break;
  }
  out.push(pointAlong(path, to));
  return out;
}

/**
 * Where the route line turns orange (slow) or red (jam), Google Maps style (user 2026-11-13: "put the colours on the
 * route"): the rest stays blue. Neighbouring sections of the same level are one stretch.
 */
export function slowStretches(path: LL[], sections: TrafficSection[]): { level: 'slow' | 'jam'; path: LL[] }[] {
  const runs: { level: 'slow' | 'jam'; from: number; to: number }[] = [];
  for (const s of sections) {
    const level = trafficLevel(s.ratio);
    if (level !== 'slow' && level !== 'jam') continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.level === level && Math.abs(prev.to - s.from) < 1) prev.to = s.to;
    else runs.push({ level, from: s.from, to: s.to });
  }
  return runs.map((r) => ({ level: r.level, path: slicePath(path, r.from, r.to) }));
}

/** Distance of the route (for tests and the bar): metres. */
export const routeLength = (path: LL[]) => pathLength(path);
export { haversine };
