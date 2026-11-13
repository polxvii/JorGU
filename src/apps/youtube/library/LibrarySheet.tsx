// YouTube library sheet: paste a link, new from subscriptions, playlists, search, trending by category (§8.2–8.4, §8.9).
// Liked videos have no tab (user decision 2026-11-10) but stay in the library search.
// youtube.com itself can't be embedded (X-Frame-Options), so "YouTube" opens the real site in a new tab.
import { useCallback, useEffect } from 'react';
import { useSettings } from '../../../features/settings/settingsStore';
import { type LibraryTab, useUi } from '../../../features/settings/uiStore';
import { type MessageKey, useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { Sheet } from '../../../shell/Sheet';
import type { Rect } from '../../../shell/geometry';
import { useAccount } from '../account/accountStore';
import { loadCategories, loadFeed, loadPopular } from '../account/library';
import { useHistory } from '../historyStore';
import { playFromList } from '../playActions';
import { ConnectCard } from './ConnectCard';
import { PastePanel } from './PastePanel';
import { PlaylistsPanel } from './PlaylistsPanel';
import { SearchPanel } from './SearchPanel';
import { withoutShortClips } from './shortClips';
import { useLoad } from './useLoad';
import { LoadFrame, VideoList } from './VideoList';
import type { Cached } from '../account/cache';
import type { CategoryItem, VideoItem } from '../../../../shared/ytTypes';

export const YOUTUBE_SITE = 'https://www.youtube.com/';

/** Order chosen by the user (2026-11-11). */
const TABS: { id: LibraryTab; label: MessageKey }[] = [
  { id: 'feed', label: 'library.tab.feed' },
  { id: 'playlists', label: 'library.tab.playlists' },
  { id: 'trending', label: 'library.tab.trending' },
  { id: 'recent', label: 'library.tab.recent' },
  { id: 'search', label: 'library.tab.search' },
  { id: 'paste', label: 'library.tab.paste' },
];

/** Music first: the owner listens more than watches. Other categories keep YouTube's order. */
const PINNED = ['10'];
const ordered = (list: CategoryItem[]) => [
  ...PINNED.flatMap((id) => list.filter((c) => c.id === id)),
  ...list.filter((c) => !PINNED.includes(c.id)),
];

/** New and Trending: short clips hidden (Settings → "Hide clips up to"). */
function VideoPanel({ load, testId, empty }: { load: (force: boolean) => Promise<Cached<VideoItem[]>>; testId: string; empty: MessageKey }) {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const upTo = useSettings((s) => s.youtube.hideUpTo);
  const state = useLoad(load);
  return (
    <LoadFrame state={state} empty={empty}>
      {(all) => {
        const items = withoutShortClips(all, upTo);
        if (!items.length) return <p className="py-6 text-center text-text-dim">{t(empty)}</p>;
        return (
          <VideoList
            testId={testId}
            items={items}
            onPlay={(i) => {
              playFromList(items, i);
              close();
            }}
          />
        );
      }}
    </LoadFrame>
  );
}

/** Videos played in JorGu on this device (no account needed). Tap = play from there on. */
function RecentPanel() {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const entries = useHistory((s) => s.entries);
  const clear = useHistory((s) => s.clear);
  useEffect(() => useHistory.getState().prune(), []);
  if (entries.length === 0) return <p className="px-1 py-6 text-center text-text-dim" data-testid="lib-recent-empty">{t('library.recentEmpty')}</p>;
  const items: VideoItem[] = entries.map((e) => ({
    videoId: e.videoId,
    title: e.title ?? t('yt.untitled'),
    channel: e.channel ?? '',
    thumb: `https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg`,
  }));
  return (
    <div className="flex flex-col gap-2">
      <VideoList
        testId="lib-recent"
        items={items}
        onPlay={(i) => {
          playFromList(items, i);
          close();
        }}
      />
      <button type="button" data-testid="lib-recent-clear" onClick={clear} className="min-h-12 rounded-xl bg-bg text-[15px] font-semibold text-danger">
        {t('library.recentClear')}
      </button>
    </div>
  );
}

/** Popular in Thailand with category chips; titles come from YouTube in the UI language (videoCategories.list). */
function TrendingPanel() {
  const t = useT();
  const lang = useSettings((s) => s.language);
  const category = useUi((s) => s.chartCategory);
  const setCategory = useUi((s) => s.setChartCategory);
  const loadCats = useCallback((force: boolean) => loadCategories(lang, force), [lang]);
  const cats = useLoad(loadCats);
  const loadChart = useCallback((force: boolean) => loadPopular(category, force), [category]);
  const chips = [{ id: '', title: t('library.allCategories') }, ...ordered(cats.data ?? [])];
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={t('library.tab.trending')} data-testid="chart-categories" className="-mx-3 flex gap-1 overflow-x-auto px-3">
        {chips.map((c) => (
          <button
            key={c.id || 'all'}
            type="button"
            role="radio"
            aria-checked={c.id === category}
            data-value={c.id}
            onClick={() => setCategory(c.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold ${
              c.id === category ? 'bg-text text-bg' : 'bg-bg text-text'
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <VideoPanel key={category || 'all'} load={loadChart} testId="lib-trending" empty="library.chartEmpty" />
    </div>
  );
}

function Panel({ tab }: { tab: LibraryTab }) {
  switch (tab) {
    case 'paste':
      return <PastePanel />;
    case 'recent':
      return <RecentPanel />;
    case 'feed':
      return <VideoPanel key="feed" load={loadFeed} testId="lib-feed" empty="library.feedEmpty" />;
    case 'playlists':
      return <PlaylistsPanel />;
    case 'search':
      return <SearchPanel />;
    case 'trending':
      return <TrendingPanel />;
  }
}

export function LibrarySheet({ rect }: { rect: Rect }) {
  const t = useT();
  const setTab = useUi((s) => s.setLibraryTab);
  const status = useAccount((s) => s.status);
  // First open: New when connected, else Link (works without an account). After that, the last tab used.
  const tab = useUi((s) => s.libraryTab) ?? (status === 'connected' ? 'feed' : 'paste');
  const expired = useAccount((s) => s.expired);
  // Scroll only the tab row (scrollIntoView could also scroll the page).
  const activeRef = useCallback((el: HTMLButtonElement | null) => {
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2);
  }, []);

  const needsAccount = tab !== 'paste' && tab !== 'recent';
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
