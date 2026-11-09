// M1 placeholders. Each embeds a same-origin probe iframe so tests can prove surfaces never reload (§6.3).
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { AppRef, SurfaceId } from '../features/settings/types';
import { useT } from '../i18n';
import { Icon } from '../shell/Icon';
import type { Rect } from '../shell/geometry';
import type { YtMode } from '../shell/computeLayout';
import { L } from '../shell/computeLayout';

function ProbeFrame({ name, className }: { name: string; className?: string }) {
  return (
    <iframe
      title={name}
      src={`/dev/frame-probe.html?name=${encodeURIComponent(name)}`}
      className={className}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

export function DashboardPlaceholder() {
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <Icon name="dashboard" size={56} className="text-accent" />
      <div className="text-2xl font-semibold">{t('apps.dashboard')}</div>
      <div className="max-w-md text-text-dim">{t('placeholder.dashboard')}</div>
    </div>
  );
}

export function MapPlaceholder() {
  const t = useT();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      style={{
        backgroundColor: 'var(--jg-bg)',
        backgroundImage:
          'linear-gradient(var(--jg-surface) 1px, transparent 1px), linear-gradient(90deg, var(--jg-surface) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      <Icon name="map" size={56} className="text-accent" />
      <div className="text-2xl font-semibold">{t('apps.map')}</div>
      <div className="max-w-md text-text-dim">{t('placeholder.map')}</div>
    </div>
  );
}

export function WebPlaceholder({ app, surfaceId }: { app: Extract<AppRef, { kind: 'web' }>; surfaceId: SurfaceId }) {
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 bg-surface px-3 pt-0 text-sm text-text-dim" style={{ marginTop: L.HEADER }}>
        <Icon name="web" size={18} />
        <span className="truncate">{app.url || t('placeholder.webNewTab')}</span>
      </div>
      <ProbeFrame name={surfaceId} className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}

/**
 * YouTube placeholder. The [data-player-rect] box stands in for the IFrame player: it is always the first child
 * (never re-parented) and its rectangle comes from the layout engine. Our controls sit outside it.
 */
export function YouTubePlaceholder({ surface, player, mode }: { surface: Rect; player: Rect | null; mode: YtMode }) {
  const t = useT();
  const playing = useUi((s) => s.youtube.playing);
  const setYoutube = useUi((s) => s.setYoutube);
  const toggle = () => setYoutube({ playing: !playing });
  const rel = player ?? { x: surface.x, y: surface.y, w: 0, h: 0 };
  const showControls = mode === 'pane' && player;
  const controlsTop = player ? player.y + player.h - surface.y : 0;
  return (
    <div className="relative h-full w-full bg-bg">
      <div
        data-player-rect
        data-playing={playing ? '1' : '0'}
        className="absolute overflow-hidden bg-black"
        style={{ left: rel.x - surface.x, top: rel.y - surface.y, width: rel.w, height: rel.h }}
      >
        <ProbeFrame name="youtube" className="h-full w-full border-0" />
      </div>
      {showControls && (
        <div
          className="absolute inset-x-0 flex flex-col items-center justify-center gap-1 px-3"
          style={{ top: controlsTop, height: Math.min(L.YT_CONTROLS, surface.h - controlsTop) }}
        >
          <div className="max-w-full truncate text-[22px] font-semibold leading-tight">
            {playing ? t('yt.simulated') : t('yt.nothingPlaying')}
          </div>
          <div className="flex items-center gap-4">
            <button type="button" aria-label={t('yt.prev')} className="flex h-12 w-12 items-center justify-center rounded-full text-text">
              <Icon name="prev" />
            </button>
            <button
              type="button"
              data-testid="yt-toggle"
              aria-label={playing ? t('yt.pause') : t('yt.play')}
              onClick={toggle}
              className="flex h-12 w-16 items-center justify-center rounded-full bg-accent text-on-accent"
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" aria-label={t('yt.next')} className="flex h-12 w-12 items-center justify-center rounded-full text-text">
              <Icon name="next" />
            </button>
          </div>
        </div>
      )}
      {mode === 'pane' && !player && <div className="p-6 text-text-dim">{t('placeholder.youtube')}</div>}
    </div>
  );
}

/** YouTube surface content that reads the theme-independent playback toggle from the store (used by chrome). */
export function useYoutubeToggle() {
  const playing = useUi((s) => s.youtube.playing);
  const setYoutube = useUi((s) => s.setYoutube);
  return { playing, toggle: () => setYoutube({ playing: !playing }) };
}

export function useBookmarks() {
  return useSettings((s) => s.web.bookmarks);
}
