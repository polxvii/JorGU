// Placeholders for apps that arrive in later milestones (Dashboard M6, Map M4).
import { useT } from '../i18n';
import { Icon } from '../shell/Icon';

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
