// Pieces shared by the Web start page and the Web menu sheet: URL bar, bookmarks, recent pages (spec §9.1).
import { useState } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import type { Bookmark, WebInstanceId } from '../../features/settings/types';
import { type MessageKey, useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { hostLabel, normalizeUrl } from './normalizeUrl';

const ERROR: Record<'scheme' | 'invalid' | 'self', MessageKey> = {
  scheme: 'web.badScheme',
  invalid: 'web.invalidUrl',
  self: 'web.selfUrl',
};

export function UrlForm({ id, initial = '', onOpened, testId }: {
  id: WebInstanceId;
  initial?: string;
  onOpened?: () => void;
  testId: string;
}) {
  const t = useT();
  const setWebUrl = useSettings((s) => s.setWebUrl);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<MessageKey | null>(null);
  return (
    <form
      // type="url" brings the URL keyboard, but its built-in check would refuse bare domains like example.com.
      noValidate
      className="flex flex-col gap-1"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        const n = normalizeUrl(text, location.origin);
        if (n.ok) {
          setError(null);
          setWebUrl(id, n.url);
          onOpened?.();
        } else if (n.reason !== 'empty') {
          setError(ERROR[n.reason]);
        }
      }}
    >
      <div className="flex gap-2">
        <input
          data-testid={`${testId}-input`}
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          placeholder={t('web.urlPlaceholder')}
          aria-label={t('web.urlPlaceholder')}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          className="min-h-14 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[16px] text-text select-text"
        />
        <button
          type="submit"
          data-testid={`${testId}-go`}
          className="min-h-14 shrink-0 rounded-xl bg-accent px-5 text-[16px] font-semibold text-on-accent"
        >
          {t('web.go')}
        </button>
      </div>
      {error && (
        <p role="alert" data-testid={`${testId}-error`} className="px-1 text-[14px] text-warn">
          {t(error)}
        </p>
      )}
    </form>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mt-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{children}</h3>;
}

function OpenRow({ title, subtitle, onOpen, testId }: { title: string; subtitle: string; onOpen: () => void; testId: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-xl bg-bg px-3 text-left">
      <span className="truncate text-[16px] font-semibold">{title}</span>
      <span className="truncate text-[13px] text-text-dim">{subtitle}</span>
    </button>
  );
}

function IconButton({ icon, label, onClick, active, testId }: {
  icon: 'pin' | 'edit' | 'trash';
  label: string;
  onClick: () => void;
  active?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-14 w-12 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

function ManagedBookmark({ b, onOpen }: { b: Bookmark; onOpen: () => void }) {
  const t = useT();
  const update = useSettings((s) => s.updateBookmark);
  const remove = useSettings((s) => s.removeBookmark);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(b.title);
  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update(b.id, { title });
          setEditing(false);
        }}
      >
        <input
          data-testid={`bookmark-title-${b.id}`}
          autoFocus
          value={title}
          aria-label={t('web.rename')}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-14 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[16px] text-text select-text"
        />
        <button type="submit" data-testid={`bookmark-save-${b.id}`} className="min-h-14 shrink-0 rounded-xl bg-accent px-4 font-semibold text-on-accent">
          {t('web.save')}
        </button>
      </form>
    );
  }
  return (
    <div className="flex gap-1">
      <OpenRow title={b.title} subtitle={hostLabel(b.url)} onOpen={onOpen} testId={`bookmark-open-${b.id}`} />
      <IconButton
        icon="pin"
        testId={`bookmark-pin-${b.id}`}
        label={b.pinned ? t('web.unpin') : t('web.pin')}
        active={b.pinned}
        onClick={() => update(b.id, { pinned: !b.pinned })}
      />
      <IconButton icon="edit" testId={`bookmark-rename-${b.id}`} label={t('web.rename')} onClick={() => setEditing(true)} />
      <IconButton icon="trash" testId={`bookmark-delete-${b.id}`} label={t('web.delete')} onClick={() => remove(b.id)} />
    </div>
  );
}

/** Bookmarks, then recent pages. `manage` adds pin (to the App Picker), rename, and delete. */
export function SiteLists({ id, manage = false, onOpened }: { id: WebInstanceId; manage?: boolean; onOpened?: () => void }) {
  const t = useT();
  const bookmarks = useSettings((s) => s.web.bookmarks);
  const recent = useSettings((s) => s.web.recent);
  const setWebUrl = useSettings((s) => s.setWebUrl);
  const open = (url: string) => {
    setWebUrl(id, url);
    onOpened?.();
  };
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{t('web.bookmarks')}</SectionTitle>
      {bookmarks.length === 0 && <p className="px-1 text-[14px] text-text-dim">{t('web.noBookmarks')}</p>}
      <ul className="flex flex-col gap-2" data-testid="web-bookmarks">
        {bookmarks.map((b) => (
          <li key={b.id} className="flex">
            {manage ? (
              <div className="min-w-0 flex-1">
                <ManagedBookmark b={b} onOpen={() => open(b.url)} />
              </div>
            ) : (
              <OpenRow title={b.title} subtitle={hostLabel(b.url)} onOpen={() => open(b.url)} testId={`bookmark-open-${b.id}`} />
            )}
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <>
          <SectionTitle>{t('web.recent')}</SectionTitle>
          <ul className="flex flex-col gap-2" data-testid="web-recent">
            {recent.map((url, i) => (
              <li key={url} className="flex">
                <OpenRow title={hostLabel(url)} subtitle={url.replace(/^https?:\/\//, '')} onOpen={() => open(url)} testId={`recent-open-${i}`} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
