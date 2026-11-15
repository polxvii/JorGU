// Played / hidden clips, muted channels and New ranking (user 2026-11-15).
import { beforeEach, describe, expect, it } from 'vitest';
import { rankFeed } from '../../src/apps/youtube/library/rankFeed';
import { SEEN_MAX_AGE_MS, SEEN_MAX_IDS, channelPlays, skipReason, useSeen } from '../../src/apps/youtube/seenStore';
import { mergeSettings } from '../../src/features/settings/merge';
import { defaultSettings } from '../../src/features/settings/types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-15T12:00:00Z');

describe('seen store', () => {
  beforeEach(() => useSeen.setState({ played: {}, hidden: {}, muted: {} }));

  it('played, hidden and muted (by id or by title) leave a clip out; played only when the setting says so', () => {
    const s = useSeen.getState();
    s.markPlayed('aaaaaaaaaaa', 'Band', NOW);
    s.hide('bbbbbbbbbbb', NOW);
    s.mute('UCxxxxxxxxxxxxxxxxxxxxxx', 'Vlogger', NOW);
    s.mute('Old Channel', 'Old Channel', NOW);
    const v = useSeen.getState();
    expect(skipReason({ videoId: 'aaaaaaaaaaa' }, v, true)).toBe('played');
    expect(skipReason({ videoId: 'aaaaaaaaaaa' }, v, false)).toBeNull();
    expect(skipReason({ videoId: 'bbbbbbbbbbb' }, v, false)).toBe('hidden');
    expect(skipReason({ videoId: 'ccccccccccc', channel: 'Vlogger', channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx' }, v, true)).toBe('muted');
    expect(skipReason({ videoId: 'ccccccccccc', channel: 'Old Channel' }, v, true)).toBe('muted');
    expect(skipReason({ videoId: 'ccccccccccc', channel: 'Other' }, v, true)).toBeNull();
    useSeen.getState().unhide('bbbbbbbbbbb');
    expect(skipReason({ videoId: 'bbbbbbbbbbb' }, useSeen.getState(), true)).toBeNull();
  });

  it('keeps 30 days at most (API data, Developer Policies III.E.4); a fresh feed refreshes muted channels', () => {
    const s = useSeen.getState();
    s.markPlayed('aaaaaaaaaaa', 'Band', NOW - 31 * DAY);
    s.markPlayed('bbbbbbbbbbb', 'Band', NOW - 2 * DAY);
    s.mute('UCxxxxxxxxxxxxxxxxxxxxxx', 'Old title', NOW - 29 * DAY);
    s.mute('UCyyyyyyyyyyyyyyyyyyyyyy', 'Gone', NOW - 29 * DAY);
    s.touch([{ channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'New title' }], NOW - DAY);
    useSeen.getState().prune(NOW + 2 * DAY);
    const v = useSeen.getState();
    expect(Object.keys(v.played)).toEqual(['bbbbbbbbbbb']);
    expect(v.muted).toEqual({ UCxxxxxxxxxxxxxxxxxxxxxx: { title: 'New title', at: NOW - DAY } });
    expect(SEEN_MAX_AGE_MS).toBe(30 * DAY);
  });

  it('keeps the newest ids when there are too many', () => {
    useSeen.setState({ hidden: Object.fromEntries(Array.from({ length: SEEN_MAX_IDS + 4 }, (_, i) => [`id${i}`, NOW + i])) });
    useSeen.getState().hide('newest', NOW + SEEN_MAX_IDS + 10);
    const ids = Object.keys(useSeen.getState().hidden);
    expect(ids).toHaveLength(SEEN_MAX_IDS);
    expect(ids).not.toContain('id4');
    expect(ids).toContain('id5');
    expect(ids).toContain('newest');
  });

  it('counts different clips played per channel', () => {
    const s = useSeen.getState();
    s.markPlayed('a1', 'Band', NOW);
    s.markPlayed('a2', 'Band', NOW);
    s.markPlayed('a1', 'Band', NOW + 1); // the same clip again
    s.markPlayed('b1', 'Other', NOW);
    s.markPlayed('c1', undefined, NOW);
    expect([...channelPlays(useSeen.getState().played)]).toEqual([
      ['Band', 2],
      ['Other', 1],
    ]);
  });
});

describe('New ranking', () => {
  const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
  const v = (id: string, channel: string, hoursAgo?: number) => ({ id, channel, publishedAt: hoursAgo === undefined ? undefined : at(hoursAgo) });

  it('newest first; a channel played more counts as newer', () => {
    const items = [v('a', 'Fav', 30), v('b', 'New', 10), v('c', 'Other', 20)];
    expect(rankFeed(items, new Map(), NOW).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    // Played 3 times: 30 h ranks like 7.5 h.
    expect(rankFeed(items, new Map([['Fav', 3]]), NOW).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('at most 2 per channel before every channel had its turn; undated clips count as a month old', () => {
    const items = [v('a1', 'Daily', 1), v('a2', 'Daily', 2), v('a3', 'Daily', 3), v('a4', 'Daily', 4), v('b1', 'Weekly', 50), v('c1', 'Undated')];
    expect(rankFeed(items, new Map(), NOW).map((x) => x.id)).toEqual(['a1', 'a2', 'b1', 'c1', 'a3', 'a4']);
  });
});

describe('settings: when the queue ends', () => {
  it('rest of the list by default; an old "keep playing the list" off stays off; Mix (removed) becomes the list', () => {
    expect(defaultSettings().youtube.continueWith).toBe('list');
    expect(mergeSettings({ youtube: { autoContinue: true } }, defaultSettings()).youtube.continueWith).toBe('list');
    expect(mergeSettings({ youtube: { autoContinue: false } }, defaultSettings()).youtube.continueWith).toBe('off');
    expect(mergeSettings({ youtube: { autoContinue: false, continueWith: 'list' } }, defaultSettings()).youtube.continueWith).toBe('list');
    expect(mergeSettings({ youtube: { continueWith: 'off' } }, defaultSettings()).youtube.continueWith).toBe('off');
    expect(mergeSettings({ youtube: { continueWith: 'mix' } }, defaultSettings()).youtube.continueWith).toBe('list');
    expect(mergeSettings({ youtube: { continueWith: 'radio' } }, defaultSettings()).youtube.continueWith).toBe('list');
    expect('autoContinue' in mergeSettings({ youtube: { autoContinue: true } }, defaultSettings()).youtube).toBe(false);
    expect(mergeSettings({ youtube: {} }, defaultSettings()).youtube.hidePlayed).toBe(true);
  });
});
