// Web menu for one Web pane (spec §9.1, §9.7): address bar, Home / Reload / Open in new tab / Bookmark, the view
// toggle (Auto + zoom, Mobile, Desktop + width), bookmarks (pin to the App Picker, rename, delete) and recent pages.
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import type { PaneIndex, WebInstanceId, WebViewMode } from '../../features/settings/types';
import { type MessageKey, useT } from '../../i18n';
import { Icon, type IconName } from '../../shell/Icon';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { hostLabel } from './normalizeUrl';
import { DESKTOP_WIDTHS, ZOOMS, resolveViewMode } from './viewMode';
import { SiteLists, UrlForm } from './WebParts';
import { useWebUi } from './webStore';

function Action({ icon, label, onClick, active, testId }: { icon: IconName; label: MessageKey; onClick: () => void; active?: boolean; testId: string }) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 text-[12px] font-semibold ${
        active ? 'bg-accent text-on-accent' : 'bg-bg text-text'
      }`}
    >
      <Icon name={icon} size={22} />
      <span className="max-w-full truncate">{t(label)}</span>
    </button>
  );
}

function Choice<T extends string | number>({ options, value, onPick, label, testId }: {
  options: { v: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
  label: string;
  testId: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="flex gap-1 rounded-xl bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          data-value={o.v}
          onClick={() => onPick(o.v)}
          className={`min-h-12 min-w-0 flex-1 truncate rounded-lg px-2 text-[15px] font-semibold ${o.v === value ? 'bg-accent text-on-accent' : 'text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ViewSection({ url, id }: { url: string; id: WebInstanceId }) {
  const t = useT();
  const mode = useSettings((s) => resolveViewMode(url, s.web.bookmarks, s.web.viewModes));
  const desktopWidth = useSettings((s) => s.web.desktopWidth);
  const setViewMode = useSettings((s) => s.setViewMode);
  const setDesktopWidth = useSettings((s) => s.setDesktopWidth);
  const pending = useWebUi((s) => !!s.viewPending[id]);
  const reload = useWebUi((s) => s.reload);
  const pick = (m: WebViewMode['mode']) =>
    setViewMode(url, m === 'auto' ? { mode: 'auto', zoom: mode.mode === 'auto' ? mode.zoom : 1 } : { mode: m });
  return (
    <section className="flex flex-col gap-2">
      <h3 className="mt-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('web.view')}</h3>
      <Choice
        testId="web-view"
        label={t('web.view')}
        value={mode.mode}
        onPick={pick}
        options={[
          { v: 'auto', label: t('web.viewAuto') },
          { v: 'mobile', label: t('web.viewMobile') },
          { v: 'desktop', label: t('web.viewDesktop') },
        ]}
      />
      {mode.mode === 'auto' && (
        <Choice
          testId="web-zoom"
          label={t('web.zoom')}
          value={mode.zoom}
          onPick={(zoom) => setViewMode(url, { mode: 'auto', zoom })}
          options={ZOOMS.map((z) => ({ v: z, label: `${Math.round(z * 100)}%` }))}
        />
      )}
      {mode.mode === 'desktop' && (
        <Choice
          testId="web-desktop-width"
          label={t('web.desktopWidth')}
          value={desktopWidth}
          onPick={setDesktopWidth}
          options={DESKTOP_WIDTHS.map((w) => ({ v: w, label: String(w) }))}
        />
      )}
      <p className="px-1 text-[13px] text-text-dim">{t('web.viewHelp')}</p>
      {pending && (
        <button
          type="button"
          data-testid="web-sheet-reload-view"
          onClick={() => reload(id)}
          className="min-h-14 rounded-xl bg-accent px-4 text-[16px] font-semibold text-on-accent"
        >
          {t('web.reloadInView')}
        </button>
      )}
    </section>
  );
}

export function WebSheet({ rect, pane }: { rect: Rect; pane: PaneIndex }) {
  const t = useT();
  const app = useSettings((s) => s.layout.panes[pane]);
  const bookmarks = useSettings((s) => s.web.bookmarks);
  const setWebUrl = useSettings((s) => s.setWebUrl);
  const addBookmark = useSettings((s) => s.addBookmark);
  const removeBookmark = useSettings((s) => s.removeBookmark);
  const reload = useWebUi((s) => s.reload);
  const close = useUi((s) => s.closeSheet);
  if (app.kind !== 'web') return null;
  const url = app.url;
  const bookmark = url ? bookmarks.find((b) => b.url === url) : undefined;
  return (
    <Sheet rect={rect} title={url ? hostLabel(url) : t('apps.web')} testId="web-sheet">
      <div className="flex flex-col gap-3 pt-1">
        <UrlForm key={url} id={app.id} initial={url} onOpened={close} testId="web-sheet-url" />
        {url && (
          <div className="flex gap-2">
            <Action
              testId="web-home"
              icon="home"
              label="web.home"
              onClick={() => {
                setWebUrl(app.id, '');
                close();
              }}
            />
            <Action
              testId="web-sheet-reload"
              icon="refresh"
              label="web.reload"
              onClick={() => {
                reload(app.id);
                close();
              }}
            />
            <div className="flex min-w-0 flex-1 flex-col items-stretch">
              <a
                href={url}
                target="_blank"
                rel="noopener"
                data-testid="web-sheet-newtab"
                aria-label={t('web.openNewTab')}
                className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-bg px-1 text-[12px] font-semibold text-text"
              >
                <Icon name="external" size={22} />
                <span className="max-w-full truncate">{t('web.newTabShort')}</span>
              </a>
            </div>
            <Action
              testId="web-bookmark"
              icon="bookmark"
              label={bookmark ? 'web.bookmarked' : 'web.addBookmark'}
              active={!!bookmark}
              onClick={() => (bookmark ? removeBookmark(bookmark.id) : addBookmark(url))}
            />
          </div>
        )}
        {url && <ViewSection url={url} id={app.id} />}
        <SiteLists id={app.id} manage onOpened={close} />
      </div>
    </Sheet>
  );
}

