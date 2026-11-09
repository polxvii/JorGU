// App Picker (spec §6.2): Dashboard, Map, YouTube, Web, plus pinned bookmarks as one-tap entries.
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { AppPick, PaneIndex } from '../features/settings/types';
import { type MessageKey, useT } from '../i18n';
import type { LayoutResult } from './computeLayout';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';
import type { Rect } from './geometry';

const ENTRIES: { kind: 'dashboard' | 'map' | 'youtube' | 'web'; label: MessageKey; icon: IconName }[] = [
  { kind: 'dashboard', label: 'apps.dashboard', icon: 'dashboard' },
  { kind: 'map', label: 'apps.map', icon: 'map' },
  { kind: 'youtube', label: 'apps.youtube', icon: 'youtube' },
  { kind: 'web', label: 'apps.web', icon: 'web' },
];

function Entry({ icon, label, current, onClick, testId }: {
  icon: IconName;
  label: string;
  current: boolean;
  onClick: () => void;
  testId: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 text-left text-[18px] font-semibold ${
        current ? 'bg-accent text-on-accent' : 'bg-bg text-text'
      }`}
    >
      <Icon name={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current && <span className="text-[13px] font-normal">{t('picker.current')}</span>}
    </button>
  );
}

export function AppPicker({ rect, pane, layout }: { rect: Rect; pane: PaneIndex; layout: LayoutResult }) {
  const t = useT();
  const panes = useSettings((s) => s.layout.panes);
  const fullscreen = useSettings((s) => s.layout.fullscreenPane) !== null;
  const bookmarks = useSettings((s) => s.web.bookmarks);
  const assign = useSettings((s) => s.assign);
  const close = useUi((s) => s.closeSheet);
  const choose = (pick: AppPick) => {
    assign(pane, pick);
    close();
  };
  const side = layout.panes.find((p) => p.index === pane)?.side ?? (pane === layout.leftPane ? 'left' : 'right');
  const title = fullscreen
    ? t('picker.titleFullscreen')
    : t('picker.title', { side: t(side === 'left' ? 'pane.left' : 'pane.right') });
  const current = panes[pane];
  return (
    <Sheet rect={rect} title={title} testId="app-picker">
      <div className="flex flex-col gap-2">
        {ENTRIES.map((e) => (
          <Entry
            key={e.kind}
            testId={`pick-${e.kind}`}
            icon={e.icon}
            label={t(e.label)}
            current={current.kind === e.kind}
            onClick={() => choose({ kind: e.kind })}
          />
        ))}
        {bookmarks.some((b) => b.pinned) && (
          <div className="mt-3 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('picker.bookmarks')}</div>
        )}
        {bookmarks
          .filter((b) => b.pinned)
          .map((b) => (
            <Entry
              key={b.id}
              testId={`pick-bookmark-${b.id}`}
              icon="bookmark"
              label={b.title}
              current={current.kind === 'web' && current.url === b.url}
              onClick={() => choose({ kind: 'web', url: b.url })}
            />
          ))}
      </div>
    </Sheet>
  );
}
