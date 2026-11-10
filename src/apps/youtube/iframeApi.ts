// Loads the official YouTube IFrame Player API (spec §8.5) once and exposes minimal typings.

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setVolume(volume: number): void;
  getVolume(): number;
  getIframe(): HTMLIFrameElement;
}

export interface YTEvent<T = number> {
  target: YTPlayer;
  data: T;
}

export interface YTPlayerOptions {
  width?: number | string;
  height?: number | string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTEvent<null>) => void;
    onStateChange?: (e: YTEvent) => void;
    onError?: (e: YTEvent) => void;
    onPlaybackRateChange?: (e: YTEvent) => void;
    onAutoplayBlocked?: (e: YTEvent<null>) => void;
  };
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

type WindowWithYT = Window & { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };

let loading: Promise<YTNamespace> | null = null;

export function loadIframeApi(): Promise<YTNamespace> {
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const w = window as WindowWithYT;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (w.YT) resolve(w.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load the YouTube player'));
    };
    document.head.append(script);
  });
  return loading;
}
