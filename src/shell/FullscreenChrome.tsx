// Controls while full screen (spec §6.5) and the mini-player handle (§6.6).
// For YouTube full screen the controls live in a permanent column beside the player, never on top of it.
import { useEffect } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import { useT, type MessageKey } from '../i18n';
import { SpeedButton } from '../apps/youtube/SpeedButton';
import { next, previous, togglePlay } from '../apps/youtube/player';
import { youtubePane } from './layoutActions';
import type { LayoutResult } from './computeLayout';
import { L } from './computeLayout';
import { exitFullscreen, switchFullscreen } from './fullscreen';
import { Icon, type IconName } from './Icon';
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
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(label)}
      onClick={onClick}
      className={`flex h-16 w-16 items-center justify-center rounded-2xl ${primary ? 'bg-accent text-on-accent' : 'bg-surface text-text'}`}
    >
      <Icon name={icon} size={30} />
    </button>
  );
}

function useFullscreenActions() {
  const fsPane = useSettings((s) => s.layout.fullscreenPane);
  const openSheet = useUi((s) => s.openSheet);
  const playing = useUi((s) => s.youtube.playing);
  return {
    exit: () => exitFullscreen('button'),
    switchApp: () => switchFullscreen(),
    picker: () => fsPane !== null && openSheet({ kind: 'picker', pane: fsPane }),
    yt: { playing, toggle: togglePlay },
  };
}

export function FloatingControls({ layout }: { layout: LayoutResult }) {
  const visible = useUi((s) => s.floatingVisible);
  const nonce = useUi((s) => s.floatingNonce);
  const hide = useUi((s) => s.hideFloating);
  const a = useFullscreenActions();
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
        gridTemplateRows: `repeat(${bar.rows}, 64px)`,
        gridAutoFlow: 'column',
      }}
    >
      <BigButton testId="fs-exit" icon="close" label="fs.exit" onClick={a.exit} primary />
      <BigButton testId="fs-switch" icon="swap" label="fs.switch" onClick={a.switchApp} />
      <BigButton testId="fs-picker" icon="apps" label="fs.picker" onClick={a.picker} />
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
  // Highest priority first; keep only what fits (64 px buttons, 4 px gaps) along the column or row.
  const row = rect.w > rect.h;
  const fits = Math.max(3, Math.floor(((row ? rect.w : rect.h) - 4) / (L.FLOAT_BUTTON + 4)));
  const buttons = [
    <BigButton key="exit" testId="fs-exit" icon="close" label="fs.exit" onClick={a.exit} primary />,
    <BigButton key="switch" testId="fs-switch" icon="swap" label="fs.switch" onClick={a.switchApp} />,
    <BigButton key="picker" testId="fs-picker" icon="apps" label="fs.picker" onClick={a.picker} />,
    <BigButton
      key="toggle"
      testId="fs-yt-toggle"
      icon={a.yt.playing ? 'pause' : 'play'}
      label={a.yt.playing ? 'yt.pause' : 'yt.play'}
      onClick={a.yt.toggle}
    />,
    <SpeedButton key="speed" size="lg" testId="fs-yt-speed" />,
    <BigButton key="next" testId="fs-yt-next" icon="next" label="yt.next" onClick={next} />,
    <BigButton key="prev" testId="fs-yt-prev" icon="prev" label="yt.prev" onClick={previous} />,
  ].slice(0, fits);
  return (
    <div
      data-chrome="control-column"
      data-testid="control-column"
      data-orientation={row ? 'row' : 'column'}
      className={`absolute z-10 flex items-center justify-center gap-1 bg-surface ${row ? 'flex-row' : 'flex-col'}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
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
