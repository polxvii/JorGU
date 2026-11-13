// How old a clip is, YouTube style ("3 days ago" / "3 วันที่ผ่านมา"), so old and new clips are told apart at a glance
// (user 2026-11-13). Uses the browser's Intl.RelativeTimeFormat in the UI language.

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** '' when the date is missing or unreadable. */
export function formatAge(iso: string | undefined, lang: string, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const seconds = Math.max(0, (now - t) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  for (const [unit, size] of STEPS) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}
