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
import { MINI_MIN_W, miniSpot } from './computeLayout';
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
 * Moves the mini player: drag the grip and it follows the finger and stays where it's let go (user 2026-11-27: not
 * only the four corners), or tap it to step to the next corner clockwise. Only the player's CSS position changes
 * (no DOM move, no reload); nothing is drawn over it while dragging (spec 3.9).
 */
function MiniGrip({ handle, range }: { handle: Rect; range: Rect }) {
  const t = useT();
  const start = useRef<{ x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const current = (): Exclude<MiniCorner, 'auto'> => {
    const s = useSettings.getState();
    const at = miniSpot(s.youtube.miniCorner, s.youtube.miniAt, s.layout.driverSide === 'right');
    return `${at.top ? 't' : 'b'}${at.right ? 'r' : 'l'}` as Exclude<MiniCorner, 'auto'>;
  };
  /** The handle's top-left corner under the finger, as 0–1 across the room the mini player has. */
  const spotAt = (cx: number, cy: number, s: { dx: number; dy: number }) => {
    const f = (v: number, from: number, len: number) => (len > 0 ? Math.round(Math.min(1, Math.max(0, (v - from) / len)) * 1000) / 1000 : 0);
    return { x: f(cx - s.dx, range.x, range.w), y: f(cy - s.dy, range.y, range.h) };
  };
  return (
    <button
      type="button"
      data-testid="mini-move"
      aria-label={t('mini.move')}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, dx: e.clientX - handle.x, dy: e.clientY - handle.y, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) s.moved = true;
        if (s.moved) useUi.getState().setMiniDrag(spotAt(e.clientX, e.clientY, s));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s?.moved) return;
        dragged.current = true;
        useSettings.getState().setMiniAt(spotAt(e.clientX, e.clientY, s));
        useUi.getState().setMiniDrag(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        useUi.getState().setMiniDrag(null);
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

/** Steps for a tap on the resize grip (dragging it gives any width). */
const MINI_STEPS = [356, 480, 640, 800];

/**
 * Resizes the mini player (user 2026-11-27: any size, not only 356×200 / 480×270): drag the grip outward (away from
 * the middle of the player) to grow it, inward to shrink it; it stays 16:9 and never under 356×200. A tap steps
 * through 356 / 480 / 640 / 800 wide (as far as it fits). The player's box changes size; it is never CSS-scaled.
 */
function MiniResize({ width, maxW, outward }: { width: number; maxW: number; outward: 1 | -1 }) {
  const t = useT();
  // Width and direction as they were when the finger went down: the player grows under it while dragging.
  const start = useRef<{ x: number; y: number; w: number; out: 1 | -1; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const widthAt = (cx: number, cy: number, s: { x: number; y: number; w: number; out: 1 | -1 }) => {
    const dx = cx - s.x;
    // Up / down counts too, by its 16:9 width (the top of the handle moves when it grows).
    const dy = ((s.y - cy) * 16) / 9;
    const d = Math.abs(dx) >= Math.abs(dy) ? s.out * dx : dy;
    return Math.round(Math.min(maxW, Math.max(MINI_MIN_W, s.w + d)));
  };
  return (
    <button
      type="button"
      data-testid="mini-resize"
      data-width={width}
      aria-label={t('mini.resize')}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, w: width, out: outward, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) s.moved = true;
        if (s.moved) useUi.getState().setMiniResize(widthAt(e.clientX, e.clientY, s));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s?.moved) return;
        dragged.current = true;
        useSettings.getState().setMiniWidth(widthAt(e.clientX, e.clientY, s));
        useUi.getState().setMiniResize(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        useUi.getState().setMiniResize(null);
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        const steps = MINI_STEPS.filter((w) => w <= maxW);
        const nextW = steps.find((w) => w > width + 1) ?? MINI_MIN_W;
        useSettings.getState().setMiniWidth(nextW);
      }}
      className="flex w-11 shrink-0 items-center justify-center rounded-t-xl bg-surface text-text"
      style={{ touchAction: 'none', order: outward === -1 ? -1 : 99 }}
    >
      <Icon name="resize" size={22} />
    </button>
  );
}

/** Play / pause and next on the handle (user 2026-11-27: the map's full-screen tap shows the map's toolbar now). */
function MiniPlayButtons() {
  const t = useT();
  const playing = useUi((s) => s.youtube.playing);
  const cls = 'flex h-full w-11 items-center justify-center rounded-t-xl bg-surface text-text';
  return (
    <>
      <button type="button" data-testid="mini-toggle" aria-label={t(playing ? 'yt.pause' : 'yt.play')} onClick={togglePlay} className={cls}>
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button type="button" data-testid="mini-next" aria-label={t('yt.next')} onClick={next} className={cls}>
        <Icon name="next" size={22} />
      </button>
    </>
  );
}

/** The speed button needs this much handle; narrower, speed stays in the queue sheet and Settings. */
const MINI_SPEED_FROM = 420;

export function MiniHandle({ rect, range, maxW }: { rect: Rect; range: Rect; maxW: number }) {
  const t = useT();
  const playing = useUi((s) => s.youtube.playing);
  const speed = rect.w >= MINI_SPEED_FROM;
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
      <MiniGrip handle={rect} range={range} />
      {/* At the end of the handle away from the nearer side edge, so dragging it outward grows the player there. */}
      <MiniResize width={rect.w} maxW={maxW} outward={rect.x + rect.w / 2 >= range.x + (range.w + rect.w) / 2 ? -1 : 1} />
      <button
        type="button"
        data-testid="mini-restore"
        aria-label={t('mini.restore')}
        onClick={restore}
        className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-t-xl bg-surface text-[14px] font-semibold text-text"
      >
        <Icon name="restore" size={22} />
        {rect.w - (5 * 44 + 6 * 4) - (speed ? 68 : 0) - (playing ? 0 : 52) >= 140 && <span className="truncate">{t('mini.restore')}</span>}
      </button>
      <MiniPlayButtons />
      {speed && (
        <div className="flex items-center rounded-t-xl bg-surface px-1">
          <SpeedButton testId="mini-speed" />
        </div>
      )}
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
