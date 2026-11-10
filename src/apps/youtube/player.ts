// Singleton YouTube player controller (spec §8.5, §3.9).
// The IFrame API iframe lives inside one host element that is never re-parented; the layout engine only moves
// that host with CSS. Automatic playback (queue advance, error skip) only starts while the player is visible.
import { create } from 'zustand';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { type YTPlayer, YT_STATE, loadIframeApi } from './iframeApi';
import { type QueueItem, currentItem, nextIndex, prevIndex, useQueue } from './queueStore';
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
}

export const usePlayerUi = create<PlayerUi>()(() => ({
  status: 'idle',
  videoId: null,
  rate: 1,
  rates: [],
  needsTap: false,
  pendingNext: false,
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
    setUi({ status: 'ended' });
    return;
  }
  playIndex(n, { auto: !manual });
}

function resumePendingIfVisible(): void {
  if (!usePlayerUi.getState().pendingNext || !canAutoPlay()) return;
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
  switch (state) {
    case YT_STATE.PLAYING:
      consecutiveErrors = 0;
      setUi({ status: 'playing', needsTap: false });
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

/** Lowers YouTube while the app speaks (M6 TTS). Returns a restore function. */
export function duck(volumePercent: number): () => void {
  if (!player) return () => {};
  const before = player.getVolume();
  player.setVolume(volumePercent);
  return () => player?.setVolume(before);
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
