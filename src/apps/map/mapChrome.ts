// Where the Map surface's own controls go (spec §7, §6.6). Pure, so the rules are unit-tested:
// - the toolbar is a column on the driver side, wrapped into more columns when the pane is too short;
// - it moves to the other side, or below whatever it would cover (mini player, full-screen floating bar);
// - the route box (time, distance, arrival) sits in a corner on the other side, at the top or the bottom as the
//   user picks (user request 2026-11-12: keep the map clear on small screens).
import { type Rect, intersects } from '../../shell/geometry';

export const MAP_GAP = 8;
export const ROUTE_BOX = { w: 196, h: 56 };

export interface MapChromeInput {
  w: number;
  h: number;
  /** First free y (below the pane header band; 0-ish in full screen). */
  top: number;
  /** Button size (Toolbar size setting). */
  btn: number;
  /** Toolbar items, the speed badge included. */
  items: number;
  preferRight: boolean;
  /** Rectangles to keep clear, relative to the surface. */
  avoid: Rect[];
  routeBox: boolean;
  routeBoxAt: 'top' | 'bottom';
}

export interface MapChrome {
  right: boolean;
  rows: number;
  cols: number;
  toolbar: Rect;
  routeBox: Rect | null;
}

const MAX_COLS = 3;

/** The toolbar at `top` on one side with at most `rows` rows (null if it doesn't fit). */
function toolbarAt(i: MapChromeInput, right: boolean, top: number, maxCols = MAX_COLS, rows = Infinity) {
  const step = i.btn + MAP_GAP;
  const fit = Math.min(rows, Math.floor((i.h - top + MAP_GAP) / step));
  if (fit < 1) return null;
  const r = Math.min(i.items, fit);
  const cols = Math.ceil(i.items / r);
  if (cols > maxCols) return null;
  const w = cols * i.btn + (cols - 1) * MAP_GAP;
  const h = r * i.btn + (r - 1) * MAP_GAP;
  return { rows: r, cols, toolbar: { x: right ? i.w - MAP_GAP - w : MAP_GAP, y: top, w, h } };
}

export function placeMapChrome(i: MapChromeInput): MapChrome {
  const clear = (r: Rect) => !i.avoid.some((a) => intersects(r, a));
  // Same height on either side first, then below each obstacle. On each, the tallest toolbar that stays clear
  // (a shorter one has more columns: it can fit above a mini player in the corner).
  const tops = [i.top, ...i.avoid.map((a) => a.y + a.h + MAP_GAP).filter((t) => t > i.top).sort((a, b) => a - b)];
  const minRows = Math.ceil(i.items / MAX_COLS);
  let pick: (NonNullable<ReturnType<typeof toolbarAt>> & { right: boolean }) | null = null;
  outer: for (const t of tops) {
    for (const right of [i.preferRight, !i.preferRight]) {
      for (let rows = i.items; rows >= minRows; rows--) {
        const c = toolbarAt(i, right, t, MAX_COLS, rows);
        if (!c) break;
        if (c.rows < rows) rows = c.rows; // capped by the height already
        if (clear(c.toolbar)) {
          pick = { ...c, right };
          break outer;
        }
      }
    }
  }
  if (!pick) {
    // Nothing is clear (tiny pane): keep it on the driver side at the top, as many columns as it takes.
    const c = toolbarAt(i, i.preferRight, i.top, Infinity) ?? {
      rows: 1,
      cols: i.items,
      toolbar: { x: i.preferRight ? i.w - MAP_GAP - i.items * (i.btn + MAP_GAP) + MAP_GAP : MAP_GAP, y: i.top, w: i.items * (i.btn + MAP_GAP) - MAP_GAP, h: i.btn },
    };
    pick = { ...c, right: i.preferRight };
  }

  let routeBox: Rect | null = null;
  if (i.routeBox) {
    const room = i.w - pick.toolbar.w - 3 * MAP_GAP;
    // Narrower beside a wide (wrapped) toolbar on a small pane, rather than on top of it.
    const w = Math.min(ROUTE_BOX.w, Math.max(88, room));
    const H = ROUTE_BOX.h;
    const x0 = pick.right ? MAP_GAP : i.w - MAP_GAP - w;
    const lowest = i.h - MAP_GAP - H;
    const y0 = i.routeBoxAt === 'top' ? i.top : lowest;
    const blockers = [...i.avoid, pick.toolbar];
    const ok = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= i.w && r.y + r.h <= i.h && !blockers.some((a) => intersects(r, a));
    // The chosen corner; else the nearest spot past whatever is there: up/down, or sideways toward the middle.
    const moves: Rect[] = [];
    for (const a of blockers) {
      moves.push({ x: x0, y: i.routeBoxAt === 'top' ? a.y + a.h + MAP_GAP : a.y - MAP_GAP - H, w, h: H });
      moves.push({ x: pick.right ? a.x + a.w + MAP_GAP : a.x - MAP_GAP - w, y: y0, w, h: H });
    }
    moves.sort((p, q) => Math.abs(p.x - x0) + Math.abs(p.y - y0) - (Math.abs(q.x - x0) + Math.abs(q.y - y0)));
    routeBox = [{ x: x0, y: y0, w, h: H }, ...moves].find(ok) ?? { x: x0, y: Math.max(0, Math.min(lowest, y0)), w, h: H };
  }
  return { right: pick.right, rows: pick.rows, cols: pick.cols, toolbar: pick.toolbar, routeBox };
}
