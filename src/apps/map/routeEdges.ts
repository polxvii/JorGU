// Route line with Traffic on (user 2026-11-12, option A): two blue edges either side of the route, and the road's
// own traffic colour (Traffic layer) showing between them. The edges are offset in screen pixels at the map's zoom,
// so their spacing stays the same at any zoom; the map redraws them when the zoom changes. Pure, so unit-tested.
import type { LL } from './routeMath';

export interface P {
  x: number;
  y: number;
}

const TILE = 256;

/** Web Mercator world pixels at this zoom (Google's 256-px tiles); y grows southwards like the screen. */
export function toWorld(p: LL, zoom: number): P {
  const s = TILE * 2 ** zoom;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((p.lat * Math.PI) / 180)));
  return { x: ((p.lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

export function fromWorld(q: P, zoom: number): LL {
  const s = TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * q.y) / s;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (q.x / s) * 360 - 180 };
}

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Douglas–Peucker: drop points closer than `tol` px to the line through their neighbours. */
export function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at > 0 && worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const norm = (a: P, b: P): P => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Right-hand side of travel, in screen coordinates (y down).
  return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
};

/** The line moved `d` px to the right of travel (negative: left). Mitred corners; bevelled when sharper than 120°. */
export function offsetLine(pts: P[], d: number): P[] {
  if (pts.length < 2) return [];
  const out: P[] = [];
  const at = (p: P, n: P, k = d) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
  out.push(at(pts[0], norm(pts[0], pts[1])));
  for (let i = 1; i < pts.length - 1; i++) {
    const n1 = norm(pts[i - 1], pts[i]);
    const n2 = norm(pts[i], pts[i + 1]);
    const mx = n1.x + n2.x;
    const my = n1.y + n2.y;
    const ml = Math.hypot(mx, my);
    const cos = ml / 2; // cos of half the turn
    if (cos < 0.5) {
      out.push(at(pts[i], n1), at(pts[i], n2));
    } else {
      out.push(at(pts[i], { x: mx / ml, y: my / ml }, d / cos));
    }
  }
  const n = pts.length;
  out.push(at(pts[n - 1], norm(pts[n - 2], pts[n - 1])));
  return out;
}

function crossing(a: P, b: P, c: P, e: P): P | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = e.x - c.x;
  const sy = e.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
}

/**
 * The inside edge of a tight bend (a U-turn) crosses itself: cut those small knots out. Only knots shorter than
 * `maxLen` px go, so a real loop in the route (a ramp that circles round) keeps its edge.
 */
export function removeKnots(pts: P[], maxLen: number, window = 24): P[] {
  const out = pts.slice();
  for (let i = 0; i < out.length - 3; i++) {
    let len = 0;
    const last = Math.min(out.length - 2, i + window);
    const lens: number[] = [];
    for (let j = i + 1; j <= last; j++) {
      len += Math.hypot(out[j].x - out[j - 1].x, out[j].y - out[j - 1].y);
      lens[j] = len;
    }
    for (let j = last; j >= i + 2; j--) {
      if (lens[j] > maxLen) continue;
      const x = crossing(out[i], out[i + 1], out[j], out[j + 1]);
      if (x) {
        out.splice(i + 1, j - i, x);
        break;
      }
    }
  }
  return out;
}

/** Left and right edges of the route, `px` screen pixels from it at this zoom. */
export function routeEdges(path: LL[], zoom: number, px: number): [LL[], LL[]] {
  if (path.length < 2) return [[], []];
  const pts = simplify(
    path.map((p) => toWorld(p, zoom)),
    0.5,
  );
  const edge = (d: number) => removeKnots(offsetLine(pts, d), 8 * px).map((q) => fromWorld(q, zoom));
  return [edge(-px), edge(px)];
}
