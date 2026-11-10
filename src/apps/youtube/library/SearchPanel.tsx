// Library-first search (spec §8.4): results from cached playlists + liked videos first, then an explicit
// "Search YouTube" button that spends search quota (≈100 units), with "About N searches left today" (§8.2).
import { useState } from 'react';
import type { VideoItem } from '../../../../shared/ytTypes';
import { useSettings } from '../../../features/settings/settingsStore';
import { useUi } from '../../../features/settings/uiStore';
import { useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { useAccount } from '../account/accountStore';
import { ApiError } from '../account/api';
import { libraryEntries, loadSearch, warmLibrary } from '../account/library';
import { type LibraryEntry, searchLibrary, stripPrefix } from '../account/libraryIndex';
import { useSearchesLeft } from '../account/quota';
import { playVideo } from '../playActions';
import { VideoList, errorKey } from './VideoList';

type YtState = null | { loading: true } | { loading: false; items: VideoItem[] } | { loading: false; error: string };

export function SearchPanel() {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const lang = useSettings((s) => s.language);
  const connected = useAccount((s) => s.status === 'connected');
  const left = useSearchesLeft();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [lib, setLib] = useState<LibraryEntry[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [yt, setYt] = useState<YtState>(null);

  const searchMine = async () => {
    const text = q.trim();
    if (!stripPrefix(text)) return;
    setQuery(text);
    setYt(null);
    setLib(searchLibrary(await libraryEntries(), text));
    if (!connected) return;
    setIndexing(true);
    await warmLibrary();
    setLib(searchLibrary(await libraryEntries(), text));
    setIndexing(false);
  };

  const searchYouTube = () => {
    setYt({ loading: true });
    loadSearch(stripPrefix(query), lang).then(
      (r) => setYt({ loading: false, items: r.data }),
      (e: unknown) => setYt({ loading: false, error: e instanceof ApiError ? e.code : 'HTTP' }),
    );
  };

  const play = (v: VideoItem) => {
    playVideo(v);
    close();
  };

  const ytError = yt && !yt.loading && 'error' in yt ? yt.error : null;
  return (
    <div className="flex flex-col gap-3 pt-1" data-testid="search-panel">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void searchMine();
        }}
      >
        <input
          data-testid="search-input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={q}
          placeholder={t('search.placeholder')}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-14 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[16px] text-text select-text"
        />
        <button
          type="submit"
          aria-label={t('search.go')}
          data-testid="search-go"
          className="flex min-h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <Icon name="search" size={24} />
        </button>
      </form>

      {lib && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('search.fromLibrary')}</h3>
          {lib.length > 0 ? (
            <VideoList
              testId="search-library-results"
              items={lib}
              onPlay={(i) => play(lib[i])}
              subtitle={(v) => [v.channel, (v as LibraryEntry).source || t('library.tab.liked')].filter(Boolean).join(' · ')}
            />
          ) : (
            !indexing && <p data-testid="search-library-empty" className="px-1 text-[14px] text-text-dim">{t('search.noLibrary')}</p>
          )}
          {indexing && <p className="px-1 text-[14px] text-text-dim">{t('search.indexing')}</p>}
        </section>
      )}

      {lib && connected && (
        <button
          type="button"
          data-testid="search-youtube"
          disabled={left === 0 || (yt?.loading ?? false)}
          onClick={searchYouTube}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-bg px-3 text-text disabled:opacity-50"
        >
          <span className="text-[16px] font-semibold">{t('search.youtube')}</span>
          <span className="text-[13px] text-text-dim" data-testid="search-left">
            {left === 0 ? t('search.quotaOut') : t('search.left', { count: left })}
          </span>
        </button>
      )}

      {yt?.loading && <p className="px-1 text-[14px] text-text-dim">{t('library.loading')}</p>}
      {ytError && (
        <p role="alert" data-testid="search-error" className="px-1 text-[14px] text-warn">
          {ytError === 'QUOTA' ? t('search.quotaOut') : ytError === 'SLOW_DOWN' ? t('search.slowDown') : t(errorKey(ytError))}
        </p>
      )}
      {yt && !yt.loading && 'items' in yt && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('search.fromYouTube')}</h3>
          {yt.items.length > 0 ? (
            <VideoList testId="search-youtube-results" items={yt.items} onPlay={(i) => play(yt.items[i])} />
          ) : (
            <p className="px-1 text-[14px] text-text-dim">{t('library.empty')}</p>
          )}
        </section>
      )}
    </div>
  );
}
