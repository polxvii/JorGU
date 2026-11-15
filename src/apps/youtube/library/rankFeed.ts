// Order of the New tab (user 2026-11-15: "lots of things I'm not interested in"). Newest first as before, but a
// channel you've played counts as newer (a clip from a channel played 3 times ranks like one 4× newer), and a
// channel gets at most `perChannel` clips before every other channel has had its turn, so one channel that uploads
// all day can't fill the top. Pure, so unit-tested.

const HOUR = 3_600_000;
/** Clips without a date count as a month old. */
const UNKNOWN_AGE_H = 30 * 24;

export function rankFeed<T extends { channel: string; publishedAt?: string }>(
  items: T[],
  plays: Map<string, number>,
  now = Date.now(),
  perChannel = 2,
): T[] {
  const score = (v: T) => {
    const t = v.publishedAt ? Date.parse(v.publishedAt) : NaN;
    const ageH = Number.isFinite(t) ? Math.max(0, (now - t) / HOUR) : UNKNOWN_AGE_H;
    return ageH / (1 + (plays.get(v.channel) ?? 0));
  };
  const sorted = items.map((v, i) => ({ v, i, s: score(v) })).sort((a, b) => a.s - b.s || a.i - b.i);
  const first: T[] = [];
  const later: T[] = [];
  const count = new Map<string, number>();
  for (const { v } of sorted) {
    const n = count.get(v.channel) ?? 0;
    count.set(v.channel, n + 1);
    (n < perChannel ? first : later).push(v);
  }
  return [...first, ...later];
}
