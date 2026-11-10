// Web controls inside a Web pane's header (spec §9.1, §9.3, §9.7): site name (opens the Web menu), Reload — or
// "Reload in this view" after a view change — and "Open in new tab", which stays available for every site.
import { useUi } from '../../features/settings/uiStore';
import type { AppRef, PaneIndex } from '../../features/settings/types';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { hostLabel } from './normalizeUrl';
import { useWebUi } from './webStore';

export function WebHeaderControls({ pane, app }: { pane: PaneIndex; app: Extract<AppRef, { kind: 'web' }> }) {
  const t = useT();
  const openSheet = useUi((s) => s.openSheet);
  const pending = useWebUi((s) => !!s.viewPending[app.id]);
  const reload = useWebUi((s) => s.reload);
  const has = !!app.url;
  return (
    <>
      <button
        type="button"
        data-testid={`web-menu-${pane}`}
        aria-label={t('web.menu')}
        onClick={() => openSheet({ kind: 'web', pane })}
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left"
      >
        <Icon name="web" size={20} className="shrink-0" />
        <span className="min-w-0 truncate text-[15px] font-semibold">{has ? hostLabel(app.url) : t('web.newTab')}</span>
      </button>
      {has && pending && (
        <button
          type="button"
          data-testid={`web-reload-view-${pane}`}
          onClick={() => reload(app.id)}
          className="h-8 max-w-36 shrink-0 truncate rounded-lg bg-accent px-2 text-[13px] font-semibold text-on-accent"
        >
          {t('web.reloadInView')}
        </button>
      )}
      {has && !pending && (
        <button
          type="button"
          data-testid={`web-reload-${pane}`}
          aria-label={t('web.reload')}
          onClick={() => reload(app.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        >
          <Icon name="refresh" size={22} />
        </button>
      )}
      {has && <NewTabLink url={app.url} testId={`web-newtab-${pane}`} />}
    </>
  );
}

/** Opens the page in a new browser tab. `noopener` only: the Referer policy stays strict-origin-when-cross-origin (§15). */
export function NewTabLink({ url, testId, label = false }: { url: string; testId: string; label?: boolean }) {
  const t = useT();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      data-testid={testId}
      aria-label={label ? undefined : t('web.openNewTab')}
      className={
        label
          ? 'flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[16px] font-semibold text-on-accent'
          : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'
      }
    >
      <Icon name="external" size={label ? 22 : 20} />
      {label && t('web.openNewTab')}
    </a>
  );
}
