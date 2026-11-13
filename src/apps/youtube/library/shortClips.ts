// New and Trending without short clips (user 2026-11-13). The Data API has no "is a Short" field and Shorts run to
// 3 min now, so the worker's guess (<= 60 s, or <= 3 min tagged #shorts) lets untagged ones through; this hides every
// clip up to the length chosen in Settings. Not used for Search: YouTube's policies don't allow changing its results.

/** Keeps live streams (0 s) and videos whose length isn't known. */
export function withoutShortClips<T extends { duration?: number }>(items: T[], upTo: number): T[] {
  return items.filter((v) => !v.duration || v.duration <= 0 || v.duration > upTo);
}
