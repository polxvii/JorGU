// Queue + player actions shared by the paste panel and the library lists. Called straight from a tap so the
// first play keeps its user activation (spec §8.5).
import type { VideoItem } from '../../../shared/ytTypes';
import { useSettings } from '../../features/settings/settingsStore';
import { playIndex } from './player';
import { type QueueItem, makeItem, useQueue } from './queueStore';

type Playable = Pick<VideoItem, 'videoId'> & Partial<Pick<VideoItem, 'title' | 'channel'>> & { start?: number };

const toItem = (v: Playable): QueueItem =>
  makeItem(v.videoId, { ...(v.title ? { title: v.title } : {}), ...(v.channel ? { channel: v.channel } : {}), ...(v.start ? { start: v.start } : {}) });

/** Plays now; whatever was queued after the current video stays queued after this one. */
export function playVideo(v: Playable): void {
  const q = useQueue.getState();
  const item = toItem(v);
  if (q.items.length === 0) {
    q.playNow([item]);
    playIndex(0, { auto: false });
  } else {
    q.addNext(item);
    playIndex(useQueue.getState().index + 1, { auto: false });
  }
}

/** How many of a list's following videos auto-continue queues. */
export const AUTO_CONTINUE_MAX = 50;

/**
 * Tap in a list (New, Trending, search, Recently): plays it now, then, with auto-continue on (Settings), the rest of
 * that list. Manually queued (+) videos still come first; a tap in another list replaces the auto part.
 */
export function playFromList(list: Playable[], index: number): void {
  const v = list[index];
  if (!v) return;
  playVideo(v);
  const rest = useSettings.getState().youtube.autoContinue ? list.slice(index + 1, index + 1 + AUTO_CONTINUE_MAX) : [];
  useQueue.getState().setAutoTail(rest.map(toItem));
}

export function queueVideos(list: Playable[]): void {
  useQueue.getState().addToEnd(list.map(toItem));
}

/** Replaces the queue with a list (a playlist) and starts at `start`. */
export function playList(list: Playable[], start = 0): void {
  if (list.length === 0) return;
  useQueue.getState().playNow(list.map(toItem), start);
  playIndex(useQueue.getState().index, { auto: false });
}
