// Placeholders for apps that arrive in later milestones. Web embeds a same-origin probe iframe so tests can
// prove surfaces never reload (§6.3).
import type { AppRef, SurfaceId } from '../features/settings/types';
import { useT } from '../i18n';
import { Icon } from '../shell/Icon';
import { L } from '../shell/computeLayout';

function ProbeFrame({ name, className }: { name: string; className?: string }) {
  return (
    <iframe
      title={name}
      src={`/dev/frame-probe.html?name=${encodeURIComponent(name)}`}
      className={className}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

export function DashboardPlaceholder() {
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <Icon name="dashboard" size={56} className="text-accent" />
      <div className="text-2xl font-semibold">{t('apps.dashboard')}</div>
      <div className="max-w-md text-text-dim">{t('placeholder.dashboard')}</div>
    </div>
  );
}

export function MapPlaceholder() {
  const t = useT();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      style={{
        backgroundColor: 'var(--jg-bg)',
        backgroundImage:
          'linear-gradient(var(--jg-surface) 1px, transparent 1px), linear-gradient(90deg, var(--jg-surface) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      <Icon name="map" size={56} className="text-accent" />
      <div className="text-2xl font-semibold">{t('apps.map')}</div>
      <div className="max-w-md text-text-dim">{t('placeholder.map')}</div>
    </div>
  );
}

export function WebPlaceholder({ app, surfaceId }: { app: Extract<AppRef, { kind: 'web' }>; surfaceId: SurfaceId }) {
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 bg-surface px-3 pt-0 text-sm text-text-dim" style={{ marginTop: L.HEADER }}>
        <Icon name="web" size={18} />
        <span className="truncate">{app.url || t('placeholder.webNewTab')}</span>
      </div>
      <ProbeFrame name={surfaceId} className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}
