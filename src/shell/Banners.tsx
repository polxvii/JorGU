// Top banners push the app area down instead of overlaying it (nothing may cover the YouTube player).
import { connectAccount, dismissExpired, useAccount } from '../apps/youtube/account/accountStore';
import { useUi } from '../features/settings/uiStore';
import { useT } from '../i18n';
import { L } from './computeLayout';
import { Icon } from './Icon';
import type { Rect } from './geometry';

export function Banners({ rect }: { rect: Rect }) {
  const t = useT();
  const online = useUi((s) => s.online);
  const updateSW = useUi((s) => s.updateSW);
  const reauth = useAccount((s) => s.expired && s.status !== 'connected');
  return (
    <div
      data-chrome="banner"
      className="absolute z-20 flex flex-col"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {!online && (
        <div role="status" className="flex items-center bg-warn px-4 text-[15px] font-semibold text-bg" style={{ height: L.BANNER }}>
          {t('banner.offline')}
        </div>
      )}
      {reauth && (
        <div role="status" data-testid="banner-reauth" className="flex items-center gap-2 bg-warn px-4 text-[15px] font-semibold text-bg" style={{ height: L.BANNER }}>
          <span className="min-w-0 flex-1 truncate">{t('banner.reauth')}</span>
          <button type="button" data-testid="banner-reconnect" onClick={connectAccount} className="h-8 shrink-0 rounded-lg bg-bg px-3 text-text">
            {t('banner.reconnect')}
          </button>
          <button
            type="button"
            aria-label={t('toast.dismiss')}
            onClick={dismissExpired}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-bg"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      )}
      {updateSW && (
        <div role="status" className="flex items-center gap-3 bg-accent px-4 text-[15px] font-semibold text-on-accent" style={{ height: L.BANNER }}>
          <span className="flex-1 truncate">{t('banner.update')}</span>
          <button type="button" onClick={updateSW} className="h-8 rounded-lg bg-bg px-3 text-text">
            {t('banner.reload')}
          </button>
        </div>
      )}
    </div>
  );
}
