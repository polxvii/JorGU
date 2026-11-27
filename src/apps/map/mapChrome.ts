// Where the Map surface's own controls go (spec §7, §6.6). Pure, so the rules are unit-tested:
// - the toolbar is a strip along the driver-side edge, the map beside it (user 2026-11-12: flush to the edge, not
//   over the map);
// - its buttons start below the pane header and stop above anything on that edge (mini player); what doesn't fit
//   goes under "More";
// - the route box (time, distance, arrival) sits in a corner of the map on the other side, top or bottom as the user
//   picks, clear of the mini player and the full-screen floating bar.
import { MAP_STRIP_PAD } from '../../shell/computeLayout';
import { type Rect, intersects } from '../../shell/geometry';

export const MAP_GAP = 8;
// Bigger (user 2026-11-13): time, distance + arrival, and the route's name, readable at a glance; still a corner.
export const ROUTE_BOX = { w: 248, h: 84 };

export interface MapChromeInput {
  w: number;
  h: number;
  /** First free y for the toolbar (below the pane header band and ⛶; 0-ish in full screen). */
  top: number;
  /** First y for the route box at the top (default `top`). Flush with the top edge (user 2026-11-17). */
  boxTop?: number;
  /** Button size (Toolbar size setting). */
  btn: number;
  /** Toolbar buttons, in priority order. */
  items: number;
  /** Strip on the right edge (driver side) or the left. */
  right: boolean;
  /** Rectangles to keep clear, relative to the surface. */
  avoid: Rect[];
  routeBox: boolean;
  routeBoxAt: 'top' | 'bottom';
}

export interface MapChrome {
  right: boolean;
  /** The strip's background, full height. */
  strip: Rect;
  /** Where the buttons are (inside the strip). */
  buttons: Rect;
  /** Buttons shown in the strip; the rest are under More. */
  shown: number;
  more: boolean;
  /** Room left in the strip for the speed badge. */
  speed: boolean;
  /** The map, beside the strip. */
  canvas: Rect;
  routeBox: Rect | null;
}

function stripOn(i: MapChromeInput, right: boolean) {
  const sw = i.btn + 2 * MAP_STRIP_PAD;
  const strip = { x: right ? i.w - sw : 0, y: 0, w: sw, h: i.h };
  // Buttons from the top down, below anything covering the top of the strip and above anything lower on it.
  let top = i.top;
  let bottom = i.h - MAP_STRIP_PAD;
  for (const a of i.avoid) {
    if (!intersects(a, strip)) continue;
    if (a.y <= top) top = Math.max(top, a.y + a.h + MAP_GAP);
    else bottom = Math.min(bottom, a.y - MAP_GAP);
  }
  const slots = Math.floor((bottom - top + MAP_GAP) / (i.btn + MAP_GAP));
  return { right, sw, strip, top, slots };
}

export function placeMapChrome(i: MapChromeInput): MapChrome {
  // The driver-side edge, unless the mini player covers nearly all of it (upright phone, short pane).
  let s = stripOn(i, i.right);
  if (s.slots < Math.min(3, i.items)) {
    const other = stripOn(i, !i.right);
    if (other.slots > s.slots) s = other;
  }
  const { right, sw, strip, top } = s;
  const slots = Math.max(1, s.slots);
  const canvas = { x: right ? 0 : sw, y: 0, w: Math.max(0, i.w - sw), h: i.h };
  const step = i.btn + MAP_GAP;
  const more = i.items > slots;
  const shown = more ? slots - 1 : i.items;
  const used = shown + (more ? 1 : 0);
  const buttons = { x: strip.x + MAP_STRIP_PAD, y: top, w: i.btn, h: Math.max(0, used * step - MAP_GAP) };

  let routeBox: Rect | null = null;
  if (i.routeBox) {
    const w = Math.min(ROUTE_BOX.w, Math.max(120, canvas.w - 2 * MAP_GAP));
    const H = ROUTE_BOX.h;
    // The far corner: the other side of the map from the strip.
    const x0 = right ? canvas.x + MAP_GAP : canvas.x + canvas.w - MAP_GAP - w;
    const lowest = i.h - MAP_GAP - H;
    const y0 = i.routeBoxAt === 'top' ? (i.boxTop ?? i.top) : lowest;
    const ok = (r: Rect) =>
      r.x >= canvas.x && r.y >= 0 && r.x + r.w <= canvas.x + canvas.w && r.y + r.h <= i.h && !i.avoid.some((a) => intersects(r, a));
    // The chosen corner; else the nearest spot past whatever is there: up/down, or sideways toward the strip.
    const moves: Rect[] = [];
    for (const a of i.avoid) {
      moves.push({ x: x0, y: i.routeBoxAt === 'top' ? a.y + a.h + MAP_GAP : a.y - MAP_GAP - H, w, h: H });
      moves.push({ x: right ? a.x + a.w + MAP_GAP : a.x - MAP_GAP - w, y: y0, w, h: H });
    }
    moves.sort((p, q) => Math.abs(p.x - x0) + Math.abs(p.y - y0) - (Math.abs(q.x - x0) + Math.abs(q.y - y0)));
    routeBox = [{ x: x0, y: y0, w, h: H }, ...moves].find(ok) ?? { x: x0, y: Math.max(0, Math.min(lowest, y0)), w, h: H };
  }
  return { right, strip, buttons, shown, more, speed: slots > used, canvas, routeBox };
}

/**
 * The arrows that move the car's place (user 2026-11-27): a 3 × 3 cross of `size` px, beside the toolbar half-way
 * up (or lower, or higher), else on the far side; never over `avoid` (mini player, route box, speed, traffic bar).
 */
export function placePad(i: { canvas: Rect; h: number; size: number; right: boolean; avoid: Rect[] }): Rect | null {
  const { canvas: c, size: s } = i;
  const near = (inset: number) => (i.right ? c.x + c.w - inset - s : c.x + inset);
  const far = i.right ? c.x + MAP_GAP : c.x + c.w - MAP_GAP - s;
  const ys = [Math.round((i.h - s) / 2), i.h - MAP_GAP - s, MAP_GAP];
  const xs = [near(MAP_GAP), near(MAP_GAP + 32), far];
  const fits = (r: Rect) => r.x >= c.x && r.x + r.w <= c.x + c.w && r.y >= 0 && r.y + r.h <= i.h && !i.avoid.some((a) => intersects(a, r));
  return xs.flatMap((x) => ys.map((y) => ({ x, y, w: s, h: s }))).find(fits) ?? null;
}
