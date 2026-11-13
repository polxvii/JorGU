// Renders every app surface exactly once in a stable order and positions it with CSS only (spec §6.3).
// Never re-parents: reordering keyed children would move DOM nodes and reload iframes, so the order is fixed
// (sorted by id) and stacking uses z-index.
import { type CSSProperties, memo, useEffect, useMemo } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { AppRef, PaneIndex, SurfaceId } from '../features/settings/types';
import { surfaceIdOf } from '../features/settings/types';
import { MapSurface } from '../apps/map/MapSurface';
import { WebSurface } from '../apps/web/WebSurface';
import { YouTubeSurface } from '../apps/youtube/YouTubeSurface';
import { L, type LayoutResult } from './computeLayout';
import type { Rect } from './geometry';

const ORDER: Record<string, number> = { map: 1, 'web:w1': 2, 'web:w2': 3, youtube: 4 };

/** Last known web AppRef per instance, so an unassigned (hidden) web surface keeps its URL. */
const lastWeb = new Map<SurfaceId, Extract<AppRef, { kind: 'web' }>>();

function surfaceStyle(rect: Rect, visible: boolean, z: number): CSSProperties {
  return {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    zIndex: z,
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
  };
}

/** What a surface's own toolbar must stay clear of (relative to the surface): the mini player and the full-screen bar. */
function avoidFor(r: Rect, layout: LayoutResult): Rect[] {
  const m = layout.mini;
  const avoid: Rect[] = [];
  if (m) avoid.push({ x: m.handle.x - r.x, y: m.handle.y - r.y, w: m.rect.w, h: m.handle.h + m.rect.h });
  // The full-screen floating bar comes back on every tap: a surface's own buttons never sit under it.
  const fb = layout.floatingBar?.rect;
  if (fb) avoid.push({ x: fb.x - r.x, y: fb.y - r.y, w: fb.w, h: fb.h });
  return avoid;
}

const SurfaceContent = memo(function SurfaceContent({ id, layout }: { id: SurfaceId; layout: LayoutResult }) {
  if (id === 'map') {
    const r = layout.surfaces.map?.rect ?? layout.content;
    return <MapSurface size={{ w: r.w, h: r.h }} avoid={avoidFor(r, layout)} band={layout.mode === 'fullscreen' ? 0 : L.YT_BAND} />;
  }
  if (id === 'youtube') {
    const y = layout.youtube;
    return <YouTubeSurface surface={y.surface} player={y.player} mode={y.mode} controls={y.controls ?? null} side={!!y.side} scale={y.controlsScale ?? 1} />;
  }
  const web = lastWeb.get(id);
  // Full screen gives the site the whole surface; in a pane the header band sits above it.
  if (!web) return null;
  const r = layout.surfaces[id]?.rect ?? layout.content;
  return <WebSurface app={web} surfaceId={id} band={layout.mode === 'fullscreen' ? 0 : L.WEB_BAND} size={{ w: r.w, h: r.h }} avoid={avoidFor(r, layout)} />;
});

export function SurfaceLayer({ layout }: { layout: LayoutResult }) {
  const panes = useSettings((s) => s.layout.panes);
  const mounted = useUi((s) => s.mounted);
  const mount = useUi((s) => s.mount);
  const setFocusedPane = useSettings((s) => s.setFocusedPane);

  for (const app of panes) if (app.kind === 'web') lastWeb.set(surfaceIdOf(app), app);

  const visibleIds = useMemo(
    () => (Object.values(layout.surfaces).filter((s) => s?.visible).map((s) => s!.id) as SurfaceId[]),
    [layout.surfaces],
  );
  useEffect(() => mount(visibleIds), [visibleIds, mount]);

  const ids = useMemo(() => {
    const all = new Set<SurfaceId>([...mounted, ...visibleIds]);
    return [...all].sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9));
  }, [mounted, visibleIds]);

  const paneOf = (id: SurfaceId): PaneIndex | null =>
    surfaceIdOf(panes[0]) === id ? 0 : surfaceIdOf(panes[1]) === id ? 1 : null;

  return (
    <div className="absolute inset-0" data-layer="surfaces">
      {ids.map((id) => {
        const box = layout.surfaces[id];
        const rect = box?.rect ?? layout.content;
        const visible = !!box?.visible;
        const pane = paneOf(id);
        return (
          <div
            key={id}
            data-surface={id}
            data-visible={visible ? '1' : '0'}
            style={surfaceStyle(rect, visible, box?.z ?? 1)}
            onPointerDownCapture={() => {
              if (pane !== null) setFocusedPane(pane);
              useUi.getState().showHeaders();
              if (layout.mode === 'fullscreen' && id !== 'youtube' && !id.startsWith('web:')) useUi.getState().showFloating();
            }}
          >
            <SurfaceContent id={id} layout={layout} />
          </div>
        );
      })}
    </div>
  );
}
