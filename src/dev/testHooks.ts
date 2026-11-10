// Hooks for Playwright tests, enabled only when localStorage 'jorgu:e2e' is '1' (set by the test harness).
import { useUi } from '../features/settings/uiStore';
import { debugSeekNearEnd, debugState } from '../apps/youtube/player';
import { useQueue } from '../apps/youtube/queueStore';

declare global {
  interface Window {
    __jorgu?: {
      /** Layout-only tests: pretend YouTube is playing without loading a video. */
      setPlaying: (playing: boolean) => void;
      yt: typeof debugState;
      seekNearEnd: typeof debugSeekNearEnd;
      queue: () => ReturnType<typeof useQueue.getState>;
    };
  }
}

export function installTestHooks(): void {
  let enabled = false;
  try {
    enabled = localStorage.getItem('jorgu:e2e') === '1';
  } catch {
    /* storage unavailable */
  }
  if (!enabled) return;
  window.__jorgu = {
    setPlaying: (playing) => useUi.getState().setYoutube({ playing }),
    yt: debugState,
    seekNearEnd: debugSeekNearEnd,
    queue: () => useQueue.getState(),
  };
}
