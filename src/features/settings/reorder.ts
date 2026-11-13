// Saved web pages and saved places in the user's own order (user 2026-11-13).

/** The list with item `id` moved one place up (-1) or down (+1); unchanged at the ends. */
export function moveById<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
