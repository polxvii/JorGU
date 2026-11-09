export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;

/** True when the rectangles share any area (touching edges do not count). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

/** Largest 16:9 rectangle centred inside `area`. */
export function fit16x9(area: Rect): Rect {
  let w = area.w;
  let h = Math.floor((w * 9) / 16);
  if (h > area.h) {
    h = area.h;
    w = Math.floor((h * 16) / 9);
  }
  return { x: area.x + Math.floor((area.w - w) / 2), y: area.y + Math.floor((area.h - h) / 2), w, h };
}

export function inset(r: Rect, t: number, rt: number, b: number, l: number): Rect {
  return { x: r.x + l, y: r.y + t, w: Math.max(0, r.w - l - rt), h: Math.max(0, r.h - t - b) };
}
