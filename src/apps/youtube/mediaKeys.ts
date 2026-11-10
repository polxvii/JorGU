// Steering-wheel / Bluetooth media keys (spec §8.5) [Verify on device: the cross-origin player iframe may own
// the media session, in which case these handlers never fire].
import { next, pause, play, previous, togglePlay } from './player';

let installed = false;

export function installMediaKeys(): void {
  if (installed) return;
  installed = true;
  if ('mediaSession' in navigator) {
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', play],
      ['pause', pause],
      ['nexttrack', next],
      ['previoustrack', previous],
    ];
    for (const [action, fn] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {
        /* action unsupported */
      }
    }
  }
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'MediaPlayPause':
        togglePlay();
        break;
      case 'MediaPlay':
        play();
        break;
      case 'MediaPause':
        pause();
        break;
      case 'MediaTrackNext':
        next();
        break;
      case 'MediaTrackPrevious':
        previous();
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}
