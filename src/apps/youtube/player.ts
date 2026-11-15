// Singleton YouTube player controller (spec §8.5, §3.9).
// The IFrame API iframe lives inside one host element that is never re-parented; the layout engine only moves
// that host with CSS. Automatic playback (queue advance, error skip, Mix) only starts while the player is visible.
//
// Mix (user 2026-11-15): when the queue ends, the player cues YouTube's Mix of the last clip ("RD" + its id, a
// playlist id the IFrame API takes), reads its video ids (getPlaylist), and JorGu queues them and plays them one by
// one with loadVideoById. The player is never left playing the Mix playlist itself: it would advance on its own
// (live check 2026-11-15: no ENDED between playlist items), past the "only while visible" rule. A Mix doesn't
// always start with its seed, and non-music clips may have none (then playback stops with a toast).
import { create } from 'zustand';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { type YTPlayer, YT_STATE, loadIframeApi } from './iframeApi';
import { videoMeta } from './account/library';
import { useHistory } from './historyStore';
import { type QueueItem, currentItem, makeItem, nextIndex, prevIndex, useQueue } from './queueStore';
import { skipReason, useSeen } from './seenStore';
import { applicableRate, nextSpeed } from './speed';

export type PlayerStatus = 'idle' | 'loading' | 'unstarted' | 'cued' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface PlayerUi {
  status: PlayerStatus;
  videoId: string | null;
  rate: number;
  rates: number[];
  /** Browser blocked autoplay: the user must tap the video itself. */
  needsTap: boolean;
  /** A video ended while the player was not visible; the next one waits. */
  pendingNext: boolean;
  muted: boolean;
}

export const usePlayerUi = create<PlayerUi>()(() => ({
  status: 'idle',
  videoId: null,
  rate: 1,
  rates: [],
  needsTap: false,
  pendingNext: false,
  muted: false,
}));

let player: YTPlayer | null = null;
let creating: Promise<YTPlayer> | null = null;
let host: HTMLElement | null = null;
let visibleRatio = 0;
let observer: IntersectionObserver | null = null;
let applyRateOnPlay = true;
let programmaticRate = NaN;
let consecutiveErrors = 0;
let iframeLoads = 0;
/** Video already written to Recently for the current play. */
let recordedId = '';
/** Seed whose Mix is cued in the player right now ('' = none). */
let mixFor = '';
let mixTimer = 0;
/** The queue ended while the player was hidden: the Mix starts when it shows again. */
let pendingMix = false;
/** Clips queued from one Mix. */
export const MIX_MAX = 25;
/** No CUED with a list by then = no Mix (non-music clips cue nothing at all). */
const MIX_TIMEOUT_MS = 8000;

const setUi = (patch: Partial<PlayerUi>) => usePlayerUi.setState(patch);

/** §3.9: automatic playback only while the player is visible and more than half of it is on screen. */
export function canAutoPlay(): boolean {
  return (
    document.visibilityState === 'visible' &&
    useUi.getState().youtube.mode !== 'hidden' &&
    visibleRatio >= 0.5
  );
}

export function attachHost(el: HTMLElement | null): void {
  if (!el || el === host) return;
  host = el;
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      visibleRatio = entries[entries.length - 1]?.intersectionRatio ?? 0;
      resumePendingIfVisible();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  observer.observe(el);
}

function ensurePlayer(): Promise<YTPlayer> {
  if (player) return Promise.resolve(player);
  if (creating) return creating;
  creating = (async () => {
    const YT = await loadIframeApi();
    if (!host) throw new Error('YouTube host element missing');
    const target = document.createElement('div');
    host.appendChild(target);
    return await new Promise<YTPlayer>((resolve) => {
      const p = new YT.Player(target, {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: () => {
            player = p;
            const iframe = p.getIframe();
            iframe.dataset.jorgu = 'youtube-player';
            iframe.addEventListener('load', () => {
              iframeLoads += 1;
            });
            resolve(p);
          },
          onStateChange: (e) => onState(e.data),
          onError: (e) => onError(e.data),
          onPlaybackRateChange: (e) => onRateChange(e.data),
          onAutoplayBlocked: () => setUi({ needsTap: true }),
        },
      });
    });
  })();
  creating.catch(() => {
    creating = null;
    setUi({ status: 'error' });
  });
  return creating;
}

function updateMediaSession(item: QueueItem | null): void {
  if (!('mediaSession' in navigator) || !item) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title ?? 'YouTube',
      artist: item.channel ?? '',
      artwork: [{ src: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }],
    });
  } catch {
    /* MediaMetadata unsupported */
  }
}

/** Plays queue item `index`. `auto` = not started by a tap (queue advance, error skip). */
export function playIndex(index: number, opts: { auto: boolean }): void {
  const q = useQueue.getState();
  const item = q.items[index];
  if (!item) return;
  q.jump(index);
  if (opts.auto && !canAutoPlay()) {
    setUi({ pendingNext: true });
    return;
  }
  setUi({ videoId: item.videoId, status: 'loading', pendingNext: false });
  cancelMix();
  recordedId = '';
  applyRateOnPlay = true;
  updateMediaSession(item);
  // Synchronous when the player already exists, so a tap's user activation is still valid.
  if (player) player.loadVideoById(item.videoId, item.start ?? 0);
  else void ensurePlayer().then((p) => p.loadVideoById(item.videoId, item.start ?? 0));
}

/** Creates the player early with the current queue item cued (no playback), so the first tap plays instantly. */
export function preparePlayer(): void {
  const item = currentItem(useQueue.getState());
  if (!item || player || creating) return;
  setUi({ videoId: item.videoId, status: 'loading' });
  void ensurePlayer().then((p) => {
    if (usePlayerUi.getState().status === 'loading') p.cueVideoById(item.videoId, item.start ?? 0);
  });
}

function advance(manual: boolean): void {
  const q = useQueue.getState();
  const n = nextIndex(q, manual);
  if (n === null) {
    const last = currentItem(q);
    if (last && wantsMix(last)) startMix(last, manual);
    else setUi({ status: 'ended' });
    return;
  }
  playIndex(n, { auto: !manual });
}

/** The queue ending after `item` continues with its Mix: Settings say so, or it came from a Mix. */
export function wantsMix(item: QueueItem): boolean {
  return item.mix === true || useSettings.getState().youtube.continueWith === 'mix';
}

function cancelMix(): void {
  mixFor = '';
  pendingMix = false;
  window.clearTimeout(mixTimer);
}

function startMix(seed: QueueItem, manual: boolean): void {
  if (!player) return;
  if (!manual && !canAutoPlay()) {
    pendingMix = true;
    setUi({ status: 'ended', pendingNext: true });
    return;
  }
  cancelMix();
  mixFor = seed.videoId;
  setUi({ status: 'loading', pendingNext: false });
  mixTimer = window.setTimeout(() => void finishMix(seed.videoId, []), MIX_TIMEOUT_MS);
  player.cuePlaylist({ list: `RD${seed.videoId}`, listType: 'playlist' });
}

/** The Mix's ids arrived (or not): queue the ones worth playing and play the first. */
async function finishMix(seedId: string, ids: string[]): Promise<void> {
  if (mixFor !== seedId) return;
  mixFor = '';
  window.clearTimeout(mixTimer);
  const q = useQueue.getState();
  const at = currentItem(q)?.key;
  const queued = new Set(q.items.map((it) => it.videoId));
  const yt = useSettings.getState().youtube;
  const seen = useSeen.getState();
  let pick = [...new Set(ids)].filter((id) => !queued.has(id) && !skipReason({ videoId: id }, seen, yt.hidePlayed));
  if (pick.length === 0) {
    setUi({ status: 'ended' });
    useUi.getState().showToast({ message: 'toast.noMix' });
    return;
  }
  // Titles, channels and lengths (videos.list, 1 unit, needs the account): drop short clips and muted channels.
  const meta = await videoMeta(pick.slice(0, 50)).catch(() => null);
  if (currentItem(useQueue.getState())?.key !== at || mixFor) return; // the user played something else meanwhile
  if (meta) {
    pick = pick.filter((id) => {
      const v = meta.get(id);
      return !v || ((!v.duration || v.duration > yt.hideUpTo) && !skipReason(v, useSeen.getState(), yt.hidePlayed));
    });
  }
  const items = pick.slice(0, MIX_MAX).map((id) => {
    const v = meta?.get(id);
    return makeItem(id, { mix: true, ...(v ? { title: v.title, channel: v.channel } : {}) });
  });
  if (items.length === 0) {
    setUi({ status: 'ended' });
    useUi.getState().showToast({ message: 'toast.noMix' });
    return;
  }
  useQueue.getState().setAutoTail(items);
  playIndex(useQueue.getState().index + 1, { auto: true });
}

function resumePendingIfVisible(): void {
  if (!usePlayerUi.getState().pendingNext || !canAutoPlay()) return;
  if (pendingMix) {
    const last = currentItem(useQueue.getState());
    pendingMix = false;
    if (last) startMix(last, false);
    return;
  }
  playIndex(useQueue.getState().index, { auto: true });
}

function applySavedRate(): void {
  if (!player) return;
  const rates = player.getAvailablePlaybackRates?.() ?? [];
  const wanted = applicableRate(useSettings.getState().youtube.playbackRate, rates);
  setUi({ rates });
  if (Math.abs(player.getPlaybackRate() - wanted) > 0.001) {
    programmaticRate = wanted;
    player.setPlaybackRate(wanted);
  }
  setUi({ rate: wanted });
}

function onState(state: number): void {
  const ui = useUi.getState();
  // The player's own volume control can mute too; keep our button in step.
  if (player) setUi({ muted: player.isMuted() });
  if (mixFor) {
    // Cueing a Mix: only its CUED (with the list) matters.
    if (state === YT_STATE.CUED && player) {
      const ids = player.getPlaylist() ?? [];
      if (ids.length) void finishMix(mixFor, ids);
    }
    return;
  }
  switch (state) {
    case YT_STATE.PLAYING:
      consecutiveErrors = 0;
      setUi({ status: 'playing', needsTap: false });
      {
        const item = currentItem(useQueue.getState());
        if (item && item.videoId !== recordedId) {
          recordedId = item.videoId;
          // A Mix clip or a pasted link may have no title yet: the player knows it.
          const data = player?.getVideoData?.();
          const title = item.title ?? (data?.video_id === item.videoId ? data.title : undefined);
          const channel = item.channel ?? (data?.video_id === item.videoId ? data.author : undefined);
          if (!item.title && title) useQueue.getState().updateMeta(item.videoId, { title, ...(channel ? { channel } : {}) });
          useHistory.getState().record({ videoId: item.videoId, title, channel });
          // Played in JorGu: New, Trending and Mix leave it out for 30 days (user 2026-11-15).
          useSeen.getState().markPlayed(item.videoId, channel);
        }
      }
      ui.setYoutube({ playing: true });
      if (applyRateOnPlay) {
        applyRateOnPlay = false;
        applySavedRate();
      }
      break;
    case YT_STATE.BUFFERING:
      setUi({ status: 'buffering' });
      break;
    case YT_STATE.PAUSED:
      setUi({ status: 'paused' });
      ui.setYoutube({ playing: false });
      break;
    case YT_STATE.CUED:
      setUi({ status: 'cued' });
      ui.setYoutube({ playing: false });
      break;
    case YT_STATE.ENDED:
      setUi({ status: 'ended' });
      ui.setYoutube({ playing: false });
      advance(false);
      break;
    default:
      setUi({ status: 'unstarted' });
  }
}

function onError(code: number): void {
  const ui = useUi.getState();
  if (mixFor) {
    // The Mix couldn't be cued (a clip without one): stop, no skipping.
    void finishMix(mixFor, []);
    return;
  }
  const videoId = usePlayerUi.getState().videoId ?? '';
  ui.setYoutube({ playing: false });
  if (code === 153) {
    // Missing Referer = a Referrer-Policy bug (§3.9). Never retry in a loop.
    console.error('YouTube player error 153: request had no HTTP Referer / client identification');
    setUi({ status: 'error' });
    ui.showToast({ message: 'toast.blocked153' });
    return;
  }
  if (code === 101 || code === 150) {
    ui.showToast({
      message: 'toast.skippedEmbed',
      action: { label: 'toast.openInYouTube', href: `https://www.youtube.com/watch?v=${videoId}` },
    });
  } else if (code === 100) {
    ui.showToast({ message: 'toast.removed' });
  } else {
    ui.showToast({ message: 'toast.cantPlay' });
  }
  consecutiveErrors += 1;
  setUi({ status: 'error' });
  if (consecutiveErrors < useQueue.getState().items.length) advance(false);
}

function onRateChange(rate: number): void {
  setUi({ rate });
  if (Math.abs(rate - programmaticRate) < 0.001) {
    programmaticRate = NaN;
    return;
  }
  // Changed in YouTube's own menu: remember it.
  useSettings.getState().setPlaybackRate(rate);
}

// ---------- controls used by the transport row, mini handle, full-screen controls, and media keys ----------

export function togglePlay(): void {
  const s = usePlayerUi.getState().status;
  if (player && (s === 'playing' || s === 'buffering')) {
    player.pauseVideo();
    return;
  }
  if (player && (s === 'paused' || s === 'cued')) {
    player.playVideo();
    return;
  }
  const q = useQueue.getState();
  if (q.items.length) playIndex(s === 'ended' ? (nextIndex(q, true) ?? q.index) : q.index, { auto: false });
}

export function play(): void {
  if (player && usePlayerUi.getState().status !== 'playing') togglePlay();
}

export function pause(): void {
  if (player && usePlayerUi.getState().status === 'playing') player.pauseVideo();
}

export function next(): void {
  advance(true);
}

export function previous(): void {
  if (player && player.getCurrentTime() > 3) {
    player.seekTo(0, true);
    return;
  }
  const p = prevIndex(useQueue.getState());
  if (p !== null) playIndex(p, { auto: false });
  else player?.seekTo(0, true);
}

/** One tap: 1× → 1.5× → 2× → 1× (user request). The choice is saved and re-applied to every video. */
export function cycleSpeed(): void {
  const saved = useSettings.getState().youtube.playbackRate;
  const rates = player?.getAvailablePlaybackRates?.() ?? [];
  const nextRate = nextSpeed(saved, rates);
  useSettings.getState().setPlaybackRate(nextRate);
  setUi({ rate: nextRate });
  if (player) {
    programmaticRate = nextRate;
    player.setPlaybackRate(nextRate);
  }
}

/** Set an exact speed (Settings). */
export function setSpeed(rate: number): void {
  useSettings.getState().setPlaybackRate(rate);
  setUi({ rate });
  if (player) {
    const r = applicableRate(rate, player.getAvailablePlaybackRates?.() ?? []);
    programmaticRate = r;
    player.setPlaybackRate(r);
  }
}

/** Jump back or ahead (user request: ±10 s). Stays inside the video. */
export function seekBy(seconds: number): void {
  if (!player) return;
  const duration = player.getDuration() || 0;
  const to = Math.max(0, player.getCurrentTime() + seconds);
  player.seekTo(duration > 0 ? Math.min(to, Math.max(0, duration - 1)) : to, true);
}

/** Mute/unmute YouTube, e.g. to hear a video in the Web pane. (iPhone ignores volume levels; mute works.) */
export function toggleMute(): void {
  if (!player) return;
  if (player.isMuted()) player.unMute();
  else player.mute();
  setUi({ muted: !usePlayerUi.getState().muted });
}

/** Read-only hooks for E2E tests. */
export function debugState() {
  return {
    hasPlayer: !!player,
    state: player?.getPlayerState() ?? null,
    time: player?.getCurrentTime() ?? 0,
    duration: player?.getDuration() ?? 0,
    rate: player?.getPlaybackRate() ?? null,
    iframeLoads,
    visibleRatio,
  };
}

export function debugSeekNearEnd(secondsBeforeEnd = 2): void {
  if (player) player.seekTo(Math.max(0, player.getDuration() - secondsBeforeEnd), true);
}

// Re-check pending advance when the page or the YouTube surface becomes visible.
document.addEventListener('visibilitychange', resumePendingIfVisible);
useUi.subscribe((s, prev) => {
  if (s.youtube.mode !== prev.youtube.mode) resumePendingIfVisible();
});
