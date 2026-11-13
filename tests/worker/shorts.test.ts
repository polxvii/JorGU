// Shorts guess for New and Trending (user request 2026-11-11). The Data API has no "is a Short" field.
import { describe, expect, it } from 'vitest';
import { looksLikeShort, parseDuration } from '../../worker/lib/yt';
import { withoutShortClips } from '../../src/apps/youtube/library/shortClips';

describe('Shorts guess', () => {
  it('parses ISO 8601 durations', () => {
    expect(parseDuration('PT45S')).toBe(45);
    expect(parseDuration('PT3M20S')).toBe(200);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('P1DT1S')).toBe(86401);
    expect(parseDuration('P0D')).toBe(0);
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration('garbage')).toBeNull();
  });

  it('≤ 60 s, or ≤ 3 min tagged #shorts; never live streams or normal songs', () => {
    expect(looksLikeShort(45, { title: 'clip' })).toBe(true);
    expect(looksLikeShort(150, { title: 'Dance #Shorts' })).toBe(true);
    expect(looksLikeShort(150, { title: 'x', description: 'more on my channel #short' })).toBe(true);
    expect(looksLikeShort(150, { title: 'x', tags: ['#shorts'] })).toBe(true);
    expect(looksLikeShort(150, { title: 'Short song' })).toBe(false);
    expect(looksLikeShort(200, { title: '#shorts' })).toBe(false);
    expect(looksLikeShort(0, { title: 'LIVE' })).toBe(false);
    expect(looksLikeShort(null, { title: '#shorts' })).toBe(false);
  });

  it('New and Trending hide clips up to the chosen length (user 2026-11-13); live and unknown lengths stay', () => {
    const list = [
      { videoId: 'a', duration: 210 },
      { videoId: 'b', duration: 95 },
      { videoId: 'c', duration: 120 },
      { videoId: 'd', duration: 170 },
      { videoId: 'e', duration: 0 },
      { videoId: 'f' },
    ];
    const ids = (upTo: number) => withoutShortClips(list, upTo).map((v) => v.videoId);
    expect(ids(120)).toEqual(['a', 'd', 'e', 'f']);
    expect(ids(180)).toEqual(['a', 'e', 'f']);
    expect(ids(60)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
