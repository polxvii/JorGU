// User feedback batch (2026-11-11): auto-continue queue, Recently, pin from Recent. (Shorts guess: tests/worker.)
import { beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_MAX, HISTORY_MAX_AGE_MS, useHistory } from '../../src/apps/youtube/historyStore';
import { makeItem, useQueue } from '../../src/apps/youtube/queueStore';
import { togglePinUrl } from '../../src/apps/web/webActions';
import { defaultSettings } from '../../src/features/settings/types';

const ids = () => useQueue.getState().items.map((i) => `${i.videoId}${i.auto ? '*' : ''}`);

describe('auto-continue queue', () => {
  beforeEach(() => useQueue.getState().clear());

  it('the rest of the tapped list follows; + items go before it; another list replaces it', () => {
    const q = useQueue.getState();
    q.playNow([makeItem('a')]);
    q.setAutoTail([makeItem('b'), makeItem('c')]);
    expect(ids()).toEqual(['a', 'b*', 'c*']);
    q.addToEnd([makeItem('m')]);
    expect(ids()).toEqual(['a', 'm', 'b*', 'c*']);
    // Tap in another list: new video after the current one, old auto part dropped, manual kept.
    q.addNext(makeItem('x'));
    q.jump(1);
    q.setAutoTail([makeItem('y')]);
    expect(ids()).toEqual(['a', 'x', 'm', 'y*']);
    // Auto-continue off = an empty tail.
    q.setAutoTail([]);
    expect(ids()).toEqual(['a', 'x', 'm']);
  });

  it('auto items already played stay (Previous still works)', () => {
    const q = useQueue.getState();
    q.playNow([makeItem('a')]);
    q.setAutoTail([makeItem('b'), makeItem('c')]);
    q.jump(1);
    q.setAutoTail([makeItem('z')]);
    expect(ids()).toEqual(['a', 'b*', 'z*']);
  });
});

describe('Recently', () => {
  beforeEach(() => useHistory.getState().clear());

  it('newest first, one entry per video, titles patched later', () => {
    const h = useHistory.getState();
    h.record({ videoId: 'a', title: 'A' }, 1000);
    h.record({ videoId: 'b' }, 2000);
    h.record({ videoId: 'a' }, 3000);
    expect(useHistory.getState().entries.map((e) => e.videoId)).toEqual(['a', 'b']);
    expect(useHistory.getState().entries[0]).toMatchObject({ title: 'A', at: 3000 });
    h.updateMeta('b', { title: 'B', channel: 'C' });
    expect(useHistory.getState().entries[1]).toMatchObject({ title: 'B', channel: 'C' });
  });

  it('keeps 30 days and at most 100 entries (Developer Policies III.E.4)', () => {
    const h = useHistory.getState();
    const now = 100 * HISTORY_MAX_AGE_MS;
    h.record({ videoId: 'old' }, now - HISTORY_MAX_AGE_MS - 1);
    h.prune(now);
    expect(useHistory.getState().entries).toEqual([]);
    for (let i = 0; i < HISTORY_MAX + 5; i++) h.record({ videoId: `v${i}` }, now + i);
    expect(useHistory.getState().entries).toHaveLength(HISTORY_MAX);
    expect(useHistory.getState().entries[0].videoId).toBe(`v${HISTORY_MAX + 4}`);
  });
});

describe('pin from Recent', () => {
  it('bookmarks + pins a recent page in one tap; tapping again unpins', () => {
    let w = togglePinUrl(defaultSettings().web, 'https://news.example/');
    expect(w.bookmarks).toMatchObject([{ url: 'https://news.example/', pinned: true, title: 'news.example' }]);
    w = togglePinUrl(w, 'https://news.example/');
    expect(w.bookmarks[0].pinned).toBe(false);
    expect(w.bookmarks).toHaveLength(1);
  });
});
