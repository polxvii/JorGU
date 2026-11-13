// Clip age on the lists (user 2026-11-13: tell old clips from new ones).
import { describe, expect, it } from 'vitest';
import { formatAge } from '../../src/apps/youtube/library/age';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe('formatAge', () => {
  it('YouTube-style buckets in the UI language', () => {
    expect(formatAge(ago(30), 'en', NOW)).toBe('this minute');
    expect(formatAge(ago(5 * 60), 'en', NOW)).toBe('5 minutes ago');
    expect(formatAge(ago(3 * 3600), 'en', NOW)).toBe('3 hours ago');
    expect(formatAge(ago(26 * 3600), 'en', NOW)).toBe('yesterday');
    expect(formatAge(ago(3 * 86400), 'en', NOW)).toBe('3 days ago');
    expect(formatAge(ago(15 * 86400), 'en', NOW)).toBe('2 weeks ago');
    expect(formatAge(ago(70 * 86400), 'en', NOW)).toBe('2 months ago');
    expect(formatAge(ago(800 * 86400), 'en', NOW)).toBe('2 years ago');
    expect(formatAge(ago(3 * 86400), 'th', NOW)).toBe('3 วันที่ผ่านมา');
  });

  it('missing, unreadable or future dates', () => {
    expect(formatAge(undefined, 'en', NOW)).toBe('');
    expect(formatAge('nope', 'en', NOW)).toBe('');
    expect(formatAge(new Date(NOW + 60_000).toISOString(), 'en', NOW)).toBe('this minute');
  });
});
