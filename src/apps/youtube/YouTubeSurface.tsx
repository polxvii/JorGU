// YouTube app surface (spec §8.5, §6.6). The [data-player-rect] host is always the first child and is never
// re-parented; the IFrame API iframe is created inside it once. Our controls sit below it, never on top.
import { Fragment, type ReactNode, useCallback, useEffect } from 'react';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import type { YtMode } from '../../shell/computeLayout';
import { L } from '../../shell/computeLayout';
import type { Rect } from '../../shell/geometry';
import { useAccount } from './account/accountStore';
import { openLibrary } from './library/libraryNav';
import { useQueue } from './queueStore';
import { SpeedButton } from './SpeedButton';
import { MuteButton, SeekButton } from './TransportButtons';
import { attachHost, next, playIndex, preparePlayer, previous, togglePlay, usePlayerUi } from './player';

function EmptyPlayer() {
  const t = useT();
  const status = usePlayerUi((s) => s.status);
  const connected = useAccount((s) => s.status === 'connected');
  const primary = 'flex min-h-12 items-center gap-2 rounded-xl bg-accent px-4 text-[16px] font-semibold text-on-accent';
  const secondary = 'flex min-h-12 items-center gap-2 rounded-xl bg-surface px-4 text-[16px] font-semibold text-text';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
      <Icon name="youtube" size={48} className="text-text-dim" />
      <div className="text-[15px] text-text-dim">
        {status === 'error' ? t('yt.loadFailed') : connected ? t('yt.emptyHintConnected') : t('yt.emptyHint')}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {connected && (
          <button type="button" data-testid="yt-empty-library" onClick={() => openLibrary('feed')} className={primary}>
            <Icon name="library" size={22} />
            {t('yt.library')}
          </button>
        )}
        <button type="button" data-testid="yt-empty-paste" onClick={() => openLibrary('paste')} className={connected ? secondary : primary}>
          <Icon name="link" size={22} />
          {t('yt.pasteLink')}
        </button>
        {!connected && (
          <button type="button" data-testid="yt-empty-connect" onClick={() => openLibrary('feed')} className={secondary}>
            <Icon name="library" size={22} />
            {t('yt.library')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Transport row. Everything fits from ~430 px; narrower panes (down to 356) drop the lowest-priority buttons first:
 * speed, then mute. Both stay reachable in the queue sheet, the mini handle, and full screen.
 */
const ROW = { pad: 16, gap: 2, button: 44, wide: { toggle: 56, speed: 56 } as Record<string, number> };
type Slot = { key: string; prio: number; el: ReactNode };

function fitSlots(slots: Slot[], width: number): Slot[] {
  let used = ROW.pad;
  const keep = new Set<string>();
  for (const s of [...slots].sort((a, b) => a.prio - b.prio)) {
    const add = (ROW.wide[s.key] ?? ROW.button) + (keep.size ? ROW.gap : 0);
    if (used + add > width) continue;
    used += add;
    keep.add(s.key);
  }
  return slots.filter((s) => keep.has(s.key));
}

function Controls({ top, height, width }: { top: number; height: number; width: number }) {
  const t = useT();
  const item = useQueue((s) => s.items[s.index]);
  const status = usePlayerUi((s) => s.status);
  const needsTap = usePlayerUi((s) => s.needsTap);
  const pendingNext = usePlayerUi((s) => s.pendingNext);
  const openSheet = useUi((s) => s.openSheet);
  const playing = status === 'playing' || status === 'buffering';
  const title = item ? (item.title ?? t('yt.untitled')) : t('yt.nothingPlaying');
  const small = 'flex h-12 w-11 shrink-0 items-center justify-center rounded-full text-text';
  const slots: Slot[] = [
    { key: 'prev', prio: 2, el: <button type="button" aria-label={t('yt.prev')} onClick={previous} className={small}><Icon name="prev" size={26} /></button> },
    { key: 'back', prio: 4, el: <SeekButton seconds={-10} testId="yt-back10" /> },
    {
      key: 'toggle',
      prio: 0,
      el: (
        <button
          type="button"
          data-testid="yt-toggle"
          aria-label={playing ? t('yt.pause') : t('yt.play')}
          onClick={togglePlay}
          className="flex h-12 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
      ),
    },
    { key: 'fwd', prio: 4, el: <SeekButton seconds={10} testId="yt-forward10" /> },
    { key: 'next', prio: 1, el: <button type="button" data-testid="yt-next" aria-label={t('yt.next')} onClick={next} className={small}><Icon name="next" size={26} /></button> },
    { key: 'mute', prio: 5, el: <MuteButton testId="yt-mute" /> },
    { key: 'speed', prio: 6, el: <SpeedButton /> },
    {
      key: 'queue',
      prio: 3,
      el: <button type="button" data-testid="yt-queue" aria-label={t('yt.queue')} onClick={() => openSheet({ kind: 'queue' })} className={small}><Icon name="queue" size={26} /></button>,
    },
    {
      key: 'library',
      prio: 3,
      el: <button type="button" data-testid="yt-library" aria-label={t('yt.library')} onClick={() => openLibrary()} className={small}><Icon name="library" size={26} /></button>,
    },
  ];
  return (
    <div className="absolute inset-x-0 flex flex-col justify-center gap-1 px-2" style={{ top, height }}>
      <div className="flex min-w-0 items-center justify-center gap-2">
        {pendingNext ? (
          <button
            type="button"
            data-testid="yt-play-next"
            onClick={() => playIndex(useQueue.getState().index, { auto: false })}
            className="rounded-lg bg-accent px-3 py-1 text-[15px] font-semibold text-on-accent"
          >
            {t('yt.playNext')}
          </button>
        ) : (
          <div data-testid="yt-title" className="min-w-0 truncate text-[20px] font-semibold leading-tight">
            {needsTap ? t('yt.tapToStart') : title}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-0.5" data-testid="yt-transport">
        {fitSlots(slots, width).map((s) => (
          <Fragment key={s.key}>{s.el}</Fragment>
        ))}
      </div>
    </div>
  );
}

export function YouTubeSurface({ surface, player, mode }: { surface: Rect; player: Rect | null; mode: YtMode }) {
  const status = usePlayerUi((s) => s.status);
  const hostRef = useCallback((el: HTMLDivElement | null) => attachHost(el), []);
  useEffect(() => preparePlayer(), []);
  const rel = player ?? { x: surface.x, y: surface.y, w: 0, h: 0 };
  const controlsTop = player ? player.y + player.h - surface.y : 0;
  return (
    <div className="relative h-full w-full bg-bg">
      <div
        ref={hostRef}
        data-player-rect
        data-status={status}
        className="absolute overflow-hidden bg-black"
        style={{ left: rel.x - surface.x, top: rel.y - surface.y, width: rel.w, height: rel.h }}
      >
        {(status === 'idle' || (status === 'error' && !usePlayerUi.getState().videoId)) && <EmptyPlayer />}
      </div>
      {mode === 'pane' && player && (
        <Controls top={controlsTop} height={Math.min(L.YT_CONTROLS, surface.h - controlsTop)} width={surface.w} />
      )}
    </div>
  );
}
