// Driver-side sheet. No backdrop: a backdrop would cover the YouTube player (§3.9); the layout engine keeps the
// player beside the sheet instead.
import type { ReactNode } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { SHEET_ZOOM } from './computeLayout';
import type { Rect } from './geometry';

export function Sheet({ rect, title, children, testId, actions }: {
  rect: Rect;
  title: string;
  children: ReactNode;
  testId: string;
  /** Extra header buttons, left of Close. */
  actions?: ReactNode;
}) {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  // Everything inside is drawn `k` times bigger (CSS zoom; no iframe is ever inside a sheet). The box is sized in
  // its own zoomed pixels so it fills `rect` exactly.
  const k = SHEET_ZOOM[useSettings((s) => s.dockSize)];
  return (
    <section
      data-chrome="sheet"
      data-testid={testId}
      role="dialog"
      aria-label={title}
      className="absolute z-20 bg-surface shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div data-testid="sheet-zoom" className="flex flex-col overflow-hidden" style={{ zoom: k, width: rect.w / k, height: rect.h / k }}>
        <header className="flex h-14 shrink-0 items-center gap-2 pl-4 pr-2">
          <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold">{title}</h2>
          {actions}
          <button
            type="button"
            data-testid="sheet-close"
            aria-label={t('sheet.close')}
            onClick={close}
            className="flex h-12 w-12 items-center justify-center rounded-xl text-text"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">{children}</div>
      </div>
    </section>
  );
}
