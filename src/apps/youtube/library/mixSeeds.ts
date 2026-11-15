// Seeds of the Mix tab (user 2026-11-15). Pure, so unit-tested.
import type { HistoryEntry } from '../historyStore';

/** Songs played most (then most recently), at most `perChannel` per channel. Pure, so unit-tested. */
export function mixSeeds(entries: HistoryEntry[], hidden: Record<string, number> = {}, max = 8, perChannel = 2): HistoryEntry[] {
  const sorted = entries.filter((e) => e.title && !hidden[e.videoId]).sort((a, b) => (b.plays ?? 1) - (a.plays ?? 1) || b.at - a.at);
  const count = new Map<string, number>();
  const out: HistoryEntry[] = [];
  for (const e of sorted) {
    const k = e.channel ?? '';
    const n = count.get(k) ?? 0;
    if (n >= perChannel) continue;
    count.set(k, n + 1);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}
