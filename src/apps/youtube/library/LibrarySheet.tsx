// YouTube library sheet: paste a link, new from subscriptions, playlists, search, music, trending (§8.2–8.4, §8.9).
// Liked videos have no tab (user decision 2026-11-10) but stay in the library search.
// youtube.com itself can't be embedded (X-Frame-Options), so "YouTube" opens the real site in a new tab.
import { useCallback } from 'react';
import { type LibraryTab, useUi } from '../../../features/settings/uiStore';
import { type MessageKey, useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { Sheet } from '../../../shell/Sheet';
import type { Rect } from '../../../shell/geometry';
import { useAccount } from '../account/accountStore';
import { loadFeed, loadPopular } from '../account/library';
import { playVideo } from '../playActions';
import { ConnectCard } from './ConnectCard';
import { PastePanel } from './PastePanel';
import { PlaylistsPanel } from './PlaylistsPanel';
import { SearchPanel } from './SearchPanel';
import { useLoad } from './useLoad';
import { LoadFrame, VideoList } from './VideoList';
import type { Cached } from '../account/cache';
import type { VideoItem } from '../../../../shared/ytTypes';

export const YOUTUBE_SITE = 'https://www.youtube.com/';

const TABS: { id: LibraryTab; label: MessageKey }[] = [
  { id: 'paste', label: 'library.tab.paste' },
  { id: 'feed', label: 'library.tab.feed' },
  { id: 'playlists', label: 'library.tab.playlists' },
  { id: 'search', label: 'library.tab.search' },
  { id: 'music', label: 'library.tab.music' },
  { id: 'trending', label: 'library.tab.trending' },
];

const loadTrending = (force: boolean) => loadPopular(false, force);
const loadMusic = (force: boolean) => loadPopular(true, force);

function VideoPanel({ load, testId, empty }: { load: (force: boolean) => Promise<Cached<VideoItem[]>>; testId: string; empty: MessageKey }) {
  const close = useUi((s) => s.closeSheet);
  const state = useLoad(load);
  return (
    <LoadFrame state={state} empty={empty}>
      {(items) => (
        <VideoList
          testId={testId}
          items={items}
          onPlay={(i) => {
            playVideo(items[i]);
            close();
          }}
        />
      )}
    </LoadFrame>
  );
}

function Panel({ tab }: { tab: LibraryTab }) {
  switch (tab) {
    case 'paste':
      return <PastePanel />;
    case 'feed':
      return <VideoPanel key="feed" load={loadFeed} testId="lib-feed" empty="library.feedEmpty" />;
    case 'playlists':
      return <PlaylistsPanel />;
    case 'search':
      return <SearchPanel />;
    case 'music':
      return <VideoPanel key="music" load={loadMusic} testId="lib-music" empty="library.empty" />;
    case 'trending':
      return <VideoPanel key="trending" load={loadTrending} testId="lib-trending" empty="library.empty" />;
  }
}

export function LibrarySheet({ rect }: { rect: Rect }) {
  const t = useT();
  const tab = useUi((s) => s.libraryTab) ?? 'paste';
  const setTab = useUi((s) => s.setLibraryTab);
  const status = useAccount((s) => s.status);
  const expired = useAccount((s) => s.expired);
  // Scroll only the tab row (scrollIntoView could also scroll the page).
  const activeRef = useCallback((el: HTMLButtonElement | null) => {
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2);
  }, []);

  const needsAccount = tab !== 'paste';
  const gated = needsAccount && (status === 'disconnected' || status === 'unavailable');
  // After an expiry (REAUTH) cached lists keep working until the user reconnects (§8.1).
  const showPanel = !gated || (status === 'disconnected' && expired);

  return (
    <Sheet
      rect={rect}
      title={t('library.title')}
      testId="library-sheet"
      actions={
        <a
          href={YOUTUBE_SITE}
          target="_blank"
          rel="noopener"
          data-testid="open-youtube"
          className="flex h-12 shrink-0 items-center gap-1 rounded-xl bg-bg px-3 text-[15px] font-semibold text-text"
        >
          <Icon name="external" size={20} />
          {t('library.openSite')}
        </a>
      }
    >
      <div role="tablist" aria-label={t('library.title')} className="sticky top-0 z-10 -mx-3 flex gap-1 overflow-x-auto bg-surface px-3 pb-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            ref={x.id === tab ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={x.id === tab}
            data-testid={`lib-tab-${x.id}`}
            onClick={() => setTab(x.id)}
            className={`min-h-12 shrink-0 rounded-xl px-3 text-[15px] font-semibold ${x.id === tab ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-1">
        {gated && <ConnectCard />}
        {showPanel && <Panel key={tab} tab={tab} />}
      </div>
    </Sheet>
  );
}
