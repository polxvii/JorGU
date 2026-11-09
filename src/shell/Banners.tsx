// Top banners push the app area down instead of overlaying it (nothing may cover the YouTube player).
import { useUi } from '../features/settings/uiStore';
import { useT } from '../i18n';
import { L } from './computeLayout';
import type { Rect } from './geometry';

export function Banners({ rect }: { rect: Rect }) {
  const t = useT();
  const online = useUi((s) => s.online);
  const updateSW = useUi((s) => s.updateSW);
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
