import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import { type MessageKey, useT } from '../i18n';
import { Icon, type IconName } from './Icon';
import type { Rect } from './geometry';

const SIZES = {
  normal: { box: 'min-h-16 w-16 text-[11px]', icon: 28 },
  large: { box: 'min-h-20 w-20 text-[12px]', icon: 34 },
  xlarge: { box: 'min-h-24 w-24 text-[14px]', icon: 40 },
} as const;

function DockButton({ icon, label, onClick, testId, active }: {
  icon: IconName;
  label: MessageKey;
  onClick: () => void;
  testId: string;
  active?: boolean;
}) {
  const t = useT();
  const z = SIZES[useSettings((s) => s.dockSize)];
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(label)}
      onClick={onClick}
      className={`flex ${z.box} flex-col items-center justify-center gap-0.5 rounded-2xl leading-tight ${
        active ? 'bg-accent text-on-accent' : 'text-text active:bg-bg'
      }`}
    >
      <Icon name={icon} size={z.icon} />
      <span className="max-w-full truncate">{t(label)}</span>
    </button>
  );
}

export function Dock({ rect }: { rect: Rect }) {
  const t = useT();
  const mode = useSettings((s) => s.layout.mode);
  const swap = useSettings((s) => s.swap);
  const toggle = useSettings((s) => s.toggleLayoutMode);
  const openSheet = useUi((s) => s.openSheet);
  const row = rect.w > rect.h;
  return (
    <nav
      data-chrome="dock"
      data-orientation={row ? 'row' : 'column'}
      aria-label={t('dock.label')}
      className={`absolute z-10 flex items-center bg-surface ${
        row ? 'flex-row justify-evenly overflow-x-auto px-2' : 'flex-col justify-start gap-2 overflow-y-auto py-2'
      }`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <DockButton testId="dock-swap" icon="swap" label="dock.swap" onClick={swap} />
      <DockButton
        testId="dock-layout"
        icon={mode === 'split' ? 'single' : 'split'}
        label={mode === 'split' ? 'dock.single' : 'dock.split'}
        onClick={toggle}
      />
      <DockButton testId="dock-settings" icon="settings" label="dock.settings" onClick={() => openSheet({ kind: 'settings' })} />
    </nav>
  );
}
