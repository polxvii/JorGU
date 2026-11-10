// Queue + player actions shared by the paste panel and the library lists. Called straight from a tap so the
// first play keeps its user activation (spec §8.5).
import type { VideoItem } from '../../../shared/ytTypes';
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

export function queueVideos(list: Playable[]): void {
  useQueue.getState().addToEnd(list.map(toItem));
}

/** Replaces the queue with a list (a playlist) and starts at `start`. */
export function playList(list: Playable[], start = 0): void {
  if (list.length === 0) return;
  useQueue.getState().playNow(list.map(toItem), start);
  playIndex(useQueue.getState().index, { auto: false });
}
