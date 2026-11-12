// Route overview geometry (spec §7.4): how far along the route line the car is, and how much is left. Pure functions,
// no Google data beyond the current route (kept in memory for this session only: Terms §3.2.3(a)).
export interface LL {
  lat: number;
  lng: number;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LL, b: LL): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(path: LL[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversine(path[i - 1], path[i]);
  return d;
}

/** Nearest point on the path: distance from it (m) and distance along the path up to it (m). */
export function projectOnPath(p: LL, path: LL[]): { off: number; along: number } {
  if (path.length === 0) return { off: Infinity, along: 0 };
  if (path.length === 1) return { off: haversine(p, path[0]), along: 0 };
  let best = { off: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    // Local flat projection (fine for segments of a road route).
    const kx = Math.cos(rad((a.lat + b.lat) / 2)) * rad(1) * R;
    const ky = rad(1) * R;
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * ky;
    const px = (p.lng - a.lng) * kx;
    const py = (p.lat - a.lat) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
    const off = Math.hypot(px - t * bx, py - t * by);
    const seg = haversine(a, b);
    if (off < best.off) best = { off, along: walked + t * seg };
    walked += seg;
  }
  return best;
}

// ---------- navigation camera (user request 2026-11-12: route ahead at the top, car low on the screen) ----------

const deg = (r: number) => (r * 180) / Math.PI;

/** Compass bearing from a to b, 0–360°. */
export function bearing(a: LL, b: LL): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `meters` from p in direction `heading`. */
export function offsetPoint(p: LL, heading: number, meters: number): LL {
  const d = meters / R;
  const h = rad(heading);
  const lat1 = rad(p.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(h));
  const lng2 = rad(p.lng) + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/** The point `along` metres down the path (clamped to its ends). */
export function pointAlong(path: LL[], along: number): LL {
  if (path.length === 0) return { lat: 0, lng: 0 };
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = haversine(path[i - 1], path[i]);
    if (walked + seg >= along && seg > 0) {
      const t = Math.max(0, (along - walked) / seg);
      return { lat: path[i - 1].lat + t * (path[i].lat - path[i - 1].lat), lng: path[i - 1].lng + t * (path[i].lng - path[i - 1].lng) };
    }
    walked += seg;
  }
  return path[path.length - 1];
}

/** Direction of the road ahead: from the car's spot on the line to `ahead` m further. Null when off the line. */
export function aheadBearing(p: LL, path: LL[], ahead = 60): number | null {
  if (path.length < 2) return null;
  const { off, along } = projectOnPath(p, path);
  if (off > OFF_ROUTE_M) return null;
  const from = pointAlong(path, along);
  const to = pointAlong(path, along + ahead);
  return haversine(from, to) < 5 ? null : bearing(from, to);
}

/** Metres per CSS pixel on a Google map (256-px tiles) at this latitude and zoom. */
export const metersPerPixel = (lat: number, zoom: number) => (156543.03392 * Math.cos(rad(lat))) / 2 ** zoom;

/** Map centre that shows the car `belowCenterPx` below the middle of a map rotated to `heading`. */
export function cameraCenter(car: LL, heading: number, zoom: number, belowCenterPx: number): LL {
  return offsetPoint(car, heading, belowCenterPx * metersPerPixel(car.lat, zoom));
}

/** Shortest turn from a to b, in degrees (-180…180). */
export const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

export const OFF_ROUTE_M = 200;
export const RECOMPUTE_MIN_MS = 60_000;

/** Distance and time left, scaled from the route's own duration (traffic-unaware: Essentials SKU). */
export function progress(p: LL, path: LL[], distanceMeters: number, durationMillis: number) {
  const total = pathLength(path) || distanceMeters || 1;
  const { off, along } = projectOnPath(p, path);
  const leftRatio = Math.max(0, Math.min(1, 1 - along / total));
  return {
    off,
    offRoute: off > OFF_ROUTE_M,
    metersLeft: Math.round(distanceMeters * leftRatio),
    millisLeft: Math.round(durationMillis * leftRatio),
  };
}
