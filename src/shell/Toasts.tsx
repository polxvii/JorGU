// Toasts are placed by the layout engine in a spot that never intersects the YouTube player (§3.9).
import { useUi } from '../features/settings/uiStore';
import { useT } from '../i18n';
import { Icon } from './Icon';
import type { Rect } from './geometry';

export function Toasts({ rect }: { rect: Rect }) {
  const t = useT();
  const toast = useUi((s) => s.toasts[s.toasts.length - 1]);
  const dismiss = useUi((s) => s.dismissToast);
  if (!toast) return null;
  return (
    <div
      data-chrome="toast"
      data-testid="toast"
      role="status"
      className="absolute z-[25] flex items-center gap-2 rounded-2xl bg-surface px-3 text-[15px] text-text shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <span className="min-w-0 flex-1 leading-tight">{t(toast.message, toast.params)}</span>
      {toast.action && (
        <a
          href={toast.action.href}
          target="_blank"
          rel="noopener"
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-on-accent"
        >
          {t(toast.action.label)}
        </a>
      )}
      <button
        type="button"
        aria-label={t('toast.dismiss')}
        onClick={() => dismiss(toast.id)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
