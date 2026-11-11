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
