// Library-first search (§8.4) and the search-quota estimate (§8.2).
import { beforeEach, describe, expect, it } from 'vitest';
import { type LibraryEntry, queryTerms, searchLibrary, stripPrefix } from '../../src/apps/youtube/account/libraryIndex';

const e = (videoId: string, title: string, channel = 'Ch', source = 'Road trip'): LibraryEntry => ({ videoId, title, channel, thumb: '', source });

const LIB: LibraryEntry[] = [
  e('aaaaaaaaaaa', 'Big Buck Bunny 60fps 4K'),
  e('bbbbbbbbbbb', 'เพลงรักฤดูร้อน (Official MV)', 'วงดนตรีไทย'),
  e('ccccccccccc', 'Lo-fi beats to drive to', 'Chill Channel'),
  e('ddddddddddd', 'Bunny facts', 'Big Buck Studio'),
  e('aaaaaaaaaaa', 'Big Buck Bunny 60fps 4K', 'Ch', ''), // same video in "liked"
];

describe('libraryIndex', () => {
  it('strips voice-style prefixes', () => {
    expect(stripPrefix('Play Big Buck')).toBe('big buck');
    expect(stripPrefix('เปิดเพลง เพลงรัก')).toBe('เพลงรัก');
    expect(stripPrefix('เล่น lo-fi')).toBe('lo-fi');
  });

  it('"play X" finds X by title, best match first, without duplicates', () => {
    const r = searchLibrary(LIB, 'play big buck');
    expect(r.map((x) => x.videoId)).toEqual(['aaaaaaaaaaa', 'ddddddddddd']);
  });

  it('matches words in any order and in the channel name', () => {
    expect(searchLibrary(LIB, 'drive lo-fi').map((x) => x.videoId)).toEqual(['ccccccccccc']);
    expect(searchLibrary(LIB, 'chill').map((x) => x.videoId)).toEqual(['ccccccccccc']);
  });

  it('Thai without spaces: segmenter words or substring', () => {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    expect(queryTerms('เพลงรัก', seg).length).toBeGreaterThan(0);
    expect(searchLibrary(LIB, 'เพลงรัก', 20, seg).map((x) => x.videoId)).toEqual(['bbbbbbbbbbb']);
    expect(searchLibrary(LIB, 'ฤดูร้อน', 20, null).map((x) => x.videoId)).toEqual(['bbbbbbbbbbb']);
    expect(searchLibrary(LIB, 'เปิดเพลง ฤดูร้อน', 20, seg).map((x) => x.videoId)).toEqual(['bbbbbbbbbbb']);
  });

  it('no match / empty query → nothing', () => {
    expect(searchLibrary(LIB, 'zzzz')).toEqual([]);
    expect(searchLibrary(LIB, 'play ')).toEqual([]);
  });
});

describe('quota', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it('Pacific day: 07:59 UTC is still the previous day in PST', async () => {
    const { pacificDay } = await import('../../src/apps/youtube/account/quota');
    expect(pacificDay(new Date('2026-11-10T07:59:00Z'))).toBe('2026-11-09');
    expect(pacificDay(new Date('2026-11-10T08:00:00Z'))).toBe('2026-11-10');
  });

  it('counts units per Pacific day and estimates searches left', async () => {
    const q = await import('../../src/apps/youtube/account/quota');
    const day1 = new Date('2026-11-10T12:00:00Z');
    q.useQuota.setState({ day: q.pacificDay(day1), units: 0 });
    // A search is 101 units (search.list + the results' lengths, 2026-11-13).
    expect(q.searchesLeft(q.useQuota.getState(), day1)).toBe(99);
    q.addUnits(101, day1); // one search
    q.addUnits(45, day1); // feed
    expect(q.searchesLeft(q.useQuota.getState(), day1)).toBe(97);
    const day2 = new Date('2026-11-11T12:00:00Z');
    expect(q.searchesLeft(q.useQuota.getState(), day2)).toBe(99);
    q.addUnits(1, day2);
    expect(q.useQuota.getState()).toMatchObject({ day: '2026-11-11', units: 1 });
    q.markQuotaExhausted(day2);
    expect(q.searchesLeft(q.useQuota.getState(), day2)).toBe(0);
  });
});
