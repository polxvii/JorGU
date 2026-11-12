// Controls while full screen (spec §6.5) and the mini-player handle (§6.6).
// For YouTube full screen the controls live in a permanent column beside the player, never on top of it.
import { type ReactElement, useEffect, useRef } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import { useT, type MessageKey } from '../i18n';
import { SpeedButton } from '../apps/youtube/SpeedButton';
import { MuteButton, SeekButton } from '../apps/youtube/TransportButtons';
import { next, previous, togglePlay } from '../apps/youtube/player';
import { youtubePane } from './layoutActions';
import type { LayoutResult } from './computeLayout';
import { miniCornerOf } from './computeLayout';
import type { MiniCorner } from '../features/settings/types';
import { exitFullscreen, switchFullscreen } from './fullscreen';
import { Icon, type IconName } from './Icon';
import { useControlSize } from './useControlSize';
import type { Rect } from './geometry';

const FLOAT_HIDE_MS = 4000;

function BigButton({ icon, label, onClick, testId, primary }: {
  icon: IconName;
  label: MessageKey;
  onClick: () => void;
  testId: string;
  primary?: boolean;
}) {
  const t = useT();
  const cs = useControlSize();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(label)}
      onClick={onClick}
      style={{ width: cs.big, height: cs.big }}
      className={`flex items-center justify-center rounded-2xl ${primary ? 'bg-accent text-on-accent' : 'bg-surface text-text'}`}
    >
      <Icon name={icon} size={cs.bigIcon} />
    </button>
  );
}

function useFullscreenActions() {
  const fsPane = useSettings((s) => s.layout.fullscreenPane);
  const fsKind = useSettings((s) => (s.layout.fullscreenPane === null ? null : s.layout.panes[s.layout.fullscreenPane].kind));
  const openSheet = useUi((s) => s.openSheet);
  const playing = useUi((s) => s.youtube.playing);
  return {
    exit: () => exitFullscreen('button'),
    switchApp: () => switchFullscreen(),
    picker: () => fsPane !== null && openSheet({ kind: 'picker', pane: fsPane }),
    /** Web full screen has no pane header: its menu comes from the floating bar. */
    webMenu: fsKind === 'web' && fsPane !== null ? () => openSheet({ kind: 'web', pane: fsPane }) : null,
    yt: { playing, toggle: togglePlay },
  };
}

export function FloatingControls({ layout }: { layout: LayoutResult }) {
  const visible = useUi((s) => s.floatingVisible);
  const nonce = useUi((s) => s.floatingNonce);
  const hide = useUi((s) => s.hideFloating);
  const a = useFullscreenActions();
  const cs = useControlSize();
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(hide, FLOAT_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [visible, nonce, hide]);
  const bar = layout.floatingBar;
  if (!bar || !visible) return null;
  const r = bar.rect;
  return (
    <div
      data-chrome="floating-bar"
      data-testid="floating-bar"
      onPointerDown={() => useUi.getState().showFloating()}
      className="absolute z-[12] grid gap-2 rounded-3xl bg-bg/85 p-2"
      style={{
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        gridTemplateRows: `repeat(${bar.rows}, ${cs.big}px)`,
        gridAutoFlow: 'column',
      }}
    >
      <BigButton testId="fs-exit" icon="close" label="fs.exit" onClick={a.exit} primary />
      <BigButton testId="fs-switch" icon="swap" label="fs.switch" onClick={a.switchApp} />
      <BigButton testId="fs-picker" icon="apps" label="fs.picker" onClick={a.picker} />
      {a.webMenu && <BigButton testId="fs-web-menu" icon="web" label="fs.webMenu" onClick={a.webMenu} />}
      <BigButton testId="fs-yt-prev" icon="prev" label="yt.prev" onClick={previous} />
      <BigButton
        testId="fs-yt-toggle"
        icon={a.yt.playing ? 'pause' : 'play'}
        label={a.yt.playing ? 'yt.pause' : 'yt.play'}
        onClick={a.yt.toggle}
      />
      <BigButton testId="fs-yt-next" icon="next" label="yt.next" onClick={next} />
      <SpeedButton size="lg" testId="fs-yt-speed" />
    </div>
  );
}

export function ControlColumn({ rect }: { rect: Rect }) {
  const a = useFullscreenActions();
  const cs = useControlSize();
  // Highest priority first; keep what fits (Toolbar size buttons, 4 px gaps). The column may hold two lines (layout engine).
  const row = rect.w > rect.h;
  const step = cs.big + 4;
  const along = Math.max(1, Math.floor(((row ? rect.w : rect.h) - 4) / step));
  const lines = Math.max(1, Math.floor(((row ? rect.h : rect.w) + 4) / (cs.column + 4)));
  const fits = Math.max(3, along * lines);
  // ±10 s come as a pair: both or neither.
  const groups: ReactElement[][] = [
    [<BigButton key="exit" testId="fs-exit" icon="close" label="fs.exit" onClick={a.exit} primary />],
    [<BigButton key="switch" testId="fs-switch" icon="swap" label="fs.switch" onClick={a.switchApp} />],
    [<BigButton key="picker" testId="fs-picker" icon="apps" label="fs.picker" onClick={a.picker} />],
    [
      <BigButton
        key="toggle"
        testId="fs-yt-toggle"
        icon={a.yt.playing ? 'pause' : 'play'}
        label={a.yt.playing ? 'yt.pause' : 'yt.play'}
        onClick={a.yt.toggle}
      />,
    ],
    [<BigButton key="next" testId="fs-yt-next" icon="next" label="yt.next" onClick={next} />],
    [<SeekButton key="back" seconds={-10} size="lg" testId="fs-yt-back10" />, <SeekButton key="fwd" seconds={10} size="lg" testId="fs-yt-forward10" />],
    [<MuteButton key="mute" size="lg" testId="fs-yt-mute" />],
    [<SpeedButton key="speed" size="lg" testId="fs-yt-speed" />],
    [<BigButton key="prev" testId="fs-yt-prev" icon="prev" label="yt.prev" onClick={previous} />],
  ];
  const buttons: ReactElement[] = [];
  for (const g of groups) if (buttons.length + g.length <= fits) buttons.push(...g);
  return (
    <div
      data-chrome="control-column"
      data-testid="control-column"
      data-orientation={row ? 'row' : 'column'}
      className="absolute z-10 grid place-content-center gap-1 bg-surface"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        gridAutoFlow: row ? 'row' : 'column',
        [row ? 'gridTemplateColumns' : 'gridTemplateRows']: `repeat(${Math.min(along, Math.ceil(buttons.length / lines))}, ${cs.big}px)`,
      }}
    >
      {buttons}
    </div>
  );
}

export function EdgeStrip({ rect }: { rect: Rect }) {
  const t = useT();
  return (
    <button
      type="button"
      data-chrome="edge-strip"
      data-testid="edge-strip"
      aria-label={t('fs.showControls')}
      onPointerDown={() => useUi.getState().showFloating()}
      className="absolute z-[11] bg-transparent"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  );
}

const CLOCKWISE: Exclude<MiniCorner, 'auto'>[] = ['tl', 'tr', 'br', 'bl'];

/**
 * Moves the mini player: drag the grip toward a corner (it snaps there on release), or tap it to step clockwise.
 * Only the player's CSS position changes; nothing is drawn over it while dragging (spec 3.9).
 */
function MiniGrip() {
  const t = useT();
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const current = (): Exclude<MiniCorner, 'auto'> => {
    const s = useSettings.getState();
    const at = miniCornerOf(s.youtube.miniCorner, s.layout.driverSide === 'right');
    return `${at.top ? 't' : 'b'}${at.right ? 'r' : 'l'}` as Exclude<MiniCorner, 'auto'>;
  };
  return (
    <button
      type="button"
      data-testid="mini-move"
      aria-label={t('mini.move')}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) s.moved = true;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s?.moved) return;
        dragged.current = true;
        const corner = `${e.clientY < window.innerHeight / 2 ? 't' : 'b'}${e.clientX < window.innerWidth / 2 ? 'l' : 'r'}` as MiniCorner;
        useSettings.getState().setMiniCorner(corner);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        const i = CLOCKWISE.indexOf(current());
        useSettings.getState().setMiniCorner(CLOCKWISE[(i + 1) % CLOCKWISE.length]);
      }}
      className="flex w-11 items-center justify-center rounded-t-xl bg-surface text-text"
      style={{ touchAction: 'none' }}
    >
      <Icon name="grip" size={22} />
    </button>
  );
}

export function MiniHandle({ rect }: { rect: Rect }) {
  const t = useT();
  const playing = useUi((s) => s.youtube.playing);
  const setYoutube = useUi((s) => s.setYoutube);
  const restore = () => {
    const s = useSettings.getState();
    const yp = youtubePane(s.layout);
    if (s.layout.fullscreenPane !== null) {
      if (yp !== null) s.switchFullscreen();
      else s.assign(s.layout.fullscreenPane, { kind: 'youtube' });
    } else if (yp !== null) {
      s.setFocusedPane(yp);
    } else {
      s.assign(s.layout.focusedPane, { kind: 'youtube' });
    }
  };
  return (
    <div
      data-chrome="mini-handle"
      data-testid="mini-handle"
      className="absolute z-[12] flex items-stretch gap-1"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h - 4 }}
    >
      <MiniGrip />
      <button
        type="button"
        data-testid="mini-restore"
        onClick={restore}
        className="flex flex-1 items-center justify-center gap-2 rounded-t-xl bg-surface text-[14px] font-semibold text-text"
      >
        <Icon name="restore" size={22} />
        {t('mini.restore')}
      </button>
      <div className="flex items-center rounded-t-xl bg-surface px-1">
        <SpeedButton testId="mini-speed" />
      </div>
      <div className="flex items-center rounded-t-xl bg-surface">
        <MuteButton testId="mini-mute" />
      </div>
      {!playing && (
        <button
          type="button"
          data-testid="mini-dismiss"
          aria-label={t('mini.dismiss')}
          onClick={() => setYoutube({ miniSticky: false })}
          className="flex w-12 items-center justify-center rounded-t-xl bg-surface text-text"
        >
          <Icon name="close" size={22} />
        </button>
      )}
    </div>
  );
}
