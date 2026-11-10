import { useAccount } from '../apps/youtube/account/accountStore';
import { useMemo } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import { type LayoutResult, computeLayout } from './computeLayout';
import { useViewport } from './useViewport';

export function useBannerCount(): number {
  const online = useUi((s) => s.online);
  const update = useUi((s) => s.updateSW);
  const reauth = useAccount((s) => s.expired && s.status !== 'connected');
  return (online ? 0 : 1) + (update ? 1 : 0) + (reauth ? 1 : 0);
}

export function useLayout(): LayoutResult {
  const vp = useViewport();
  const layout = useSettings((s) => s.layout);
  const miniSize = useSettings((s) => s.youtube.miniPlayerSize);
  const playing = useUi((s) => s.youtube.playing);
  const miniSticky = useUi((s) => s.youtube.miniSticky);
  const sheetOpen = useUi((s) => s.sheet !== null);
  const toast = useUi((s) => s.toasts.length > 0);
  const bannerCount = useBannerCount();
  return useMemo(
    () =>
      computeLayout({
        viewport: { width: vp.width, height: vp.height },
        safeArea: vp.safeArea,
        layout,
        youtube: { playing, miniSticky, miniSize },
        bannerCount,
        sheetOpen,
        toast,
      }),
    [vp, layout, playing, miniSticky, miniSize, bannerCount, sheetOpen, toast],
  );
}
