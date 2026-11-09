// Service worker is optional: the CarPlay in-app browser likely has none (spec §3.10, §14).
// Never reloads by itself; the user taps "Reload" in the update banner.
import { useUi } from '../features/settings/uiStore';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          useUi.getState().setUpdateSW(() => void updateSW(true));
        },
      });
    })
    .catch(() => {
      /* no service worker in this browser */
    });
}
