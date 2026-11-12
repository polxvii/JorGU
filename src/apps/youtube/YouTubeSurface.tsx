// YouTube app surface (spec §8.5, §6.6). The [data-player-rect] host is always the first child and is never
// re-parented; the IFrame API iframe is created inside it once. Our controls sit beside or below it, never on top.
import { Fragment, type ReactNode, useCallback, useEffect } from 'react';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { YT_ROW_GAP, YT_STRIP_PAD, type YtMode } from '../../shell/computeLayout';
import type { Rect } from '../../shell/geometry';
import { useAccount } from './account/accountStore';
import { openLibrary } from './library/libraryNav';
import { SpeedButton } from './SpeedButton';
import { useControlSize } from '../../shell/useControlSize';
import { MuteButton, SeekButton } from './TransportButtons';
import { attachHost, next, preparePlayer, previous, togglePlay, usePlayerUi } from './player';

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
type Slot = { key: string; prio: number; el: ReactNode };

/** Transport controls: a strip beside the player, or 1–2 rows under it (layout engine decides; never over it). */
function Controls({ rect, side }: { rect: Rect; side: boolean }) {
  const t = useT();
  const status = usePlayerUi((s) => s.status);
  const openSheet = useUi((s) => s.openSheet);
  const playing = status === 'playing' || status === 'buffering';
  // Toolbar size (Settings) scales these too (user 2026-11-12).
  const cs = useControlSize();
  const small = 'flex shrink-0 items-center justify-center rounded-full text-text';
  const sm = { width: cs.rowNarrow, height: cs.row };
  const slots: Slot[] = [
    { key: 'prev', prio: 2, el: <button type="button" aria-label={t('yt.prev')} onClick={previous} className={small} style={sm}><Icon name="prev" size={cs.rowIcon} /></button> },
    { key: 'back', prio: 4, el: <SeekButton seconds={-10} size="row" testId="yt-back10" /> },
    {
      key: 'toggle',
      prio: 0,
      el: (
        <button
          type="button"
          data-testid="yt-toggle"
          aria-label={playing ? t('yt.pause') : t('yt.play')}
          onClick={togglePlay}
          style={{ width: cs.rowWide, height: cs.row }}
          className="flex shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <Icon name={playing ? 'pause' : 'play'} size={cs.rowIcon - 2} />
        </button>
      ),
    },
    { key: 'fwd', prio: 4, el: <SeekButton seconds={10} size="row" testId="yt-forward10" /> },
    { key: 'next', prio: 1, el: <button type="button" data-testid="yt-next" aria-label={t('yt.next')} onClick={next} className={small} style={sm}><Icon name="next" size={cs.rowIcon} /></button> },
    { key: 'mute', prio: 5, el: <MuteButton size="row" testId="yt-mute" /> },
    { key: 'speed', prio: 6, el: <SpeedButton size="row" /> },
    {
      key: 'queue',
      prio: 3,
      el: <button type="button" data-testid="yt-queue" aria-label={t('yt.queue')} onClick={() => openSheet({ kind: 'queue' })} className={small} style={sm}><Icon name="queue" size={cs.rowIcon} /></button>,
    },
    {
      key: 'library',
      prio: 3,
      el: <button type="button" data-testid="yt-library" aria-label={t('yt.library')} onClick={() => openLibrary()} className={small} style={sm}><Icon name="library" size={cs.rowIcon} /></button>,
    },
  ];
  // What doesn't fit is still in the queue sheet (±10 s, mute, speed).
  const fits = side ? Math.max(1, Math.floor((rect.h - 2 * YT_STRIP_PAD + YT_ROW_GAP) / (cs.row + YT_ROW_GAP))) : slots.length;
  const keep = new Set([...slots].sort((a, b) => a.prio - b.prio).slice(0, fits).map((s) => s.key));
  return (
    <div
      data-testid="yt-transport"
      data-side={side ? '1' : '0'}
      className={`absolute flex items-center justify-center ${side ? 'flex-col justify-start bg-surface' : 'flex-wrap content-center'}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, padding: YT_STRIP_PAD, rowGap: YT_ROW_GAP, columnGap: side ? 0 : 2 }}
    >
      {slots
        .filter((s) => keep.has(s.key))
        .map((s) => (
          <Fragment key={s.key}>{s.el}</Fragment>
        ))}
    </div>
  );
}

export function YouTubeSurface({ surface, player, mode, controls, side }: { surface: Rect; player: Rect | null; mode: YtMode; controls: Rect | null; side: boolean }) {
  const status = usePlayerUi((s) => s.status);
  const hostRef = useCallback((el: HTMLDivElement | null) => attachHost(el), []);
  useEffect(() => preparePlayer(), []);
  const rel = player ?? { x: surface.x, y: surface.y, w: 0, h: 0 };
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
      {mode === 'pane' && player && controls && (
        <Controls rect={{ x: controls.x - surface.x, y: controls.y - surface.y, w: controls.w, h: controls.h }} side={side} />
      )}
    </div>
  );
}
