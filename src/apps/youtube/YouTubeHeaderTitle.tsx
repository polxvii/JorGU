// The clip title lives in the YouTube pane header (user 2026-11-12: don't spend a row on it). Plain text, so the
// header still drags to swap panes; the queue sheet shows the full title. "Play next" and "Tap to start" show here too.
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { useQueue } from './queueStore';
import { playIndex, usePlayerUi } from './player';

export function YouTubeHeaderTitle() {
  const t = useT();
  const item = useQueue((s) => s.items[s.index]);
  const needsTap = usePlayerUi((s) => s.needsTap);
  const pendingNext = usePlayerUi((s) => s.pendingNext);
  const title = needsTap ? t('yt.tapToStart') : item ? (item.title ?? t('yt.untitled')) : t('apps.youtube');
  return (
    <>
      <Icon name="youtube" size={20} className="shrink-0" />
      {pendingNext ? (
        <button
          type="button"
          data-testid="yt-play-next"
          onClick={() => playIndex(useQueue.getState().index, { auto: false })}
          className="h-8 shrink-0 rounded-lg bg-accent px-3 text-[14px] font-semibold text-on-accent"
        >
          {t('yt.playNext')}
        </button>
      ) : (
        <span data-testid="yt-title" title={title} className="line-clamp-2 min-w-0 text-[14px] font-semibold leading-tight">
          {title}
        </span>
      )}
      <span className="flex-1" />
    </>
  );
}
