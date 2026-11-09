// Renders every app surface exactly once in a stable order and positions it with CSS only (spec §6.3).
// Never re-parents: reordering keyed children would move DOM nodes and reload iframes, so the order is fixed
// (sorted by id) and stacking uses z-index.
import { type CSSProperties, memo, useEffect, useMemo } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { AppRef, PaneIndex, SurfaceId } from '../features/settings/types';
import { surfaceIdOf } from '../features/settings/types';
import { DashboardPlaceholder, MapPlaceholder, WebPlaceholder, YouTubePlaceholder } from '../apps/placeholders';
import type { LayoutResult } from './computeLayout';
import type { Rect } from './geometry';

const ORDER: Record<string, number> = { dashboard: 0, map: 1, 'web:w1': 2, 'web:w2': 3, youtube: 4 };

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

const SurfaceContent = memo(function SurfaceContent({ id, layout }: { id: SurfaceId; layout: LayoutResult }) {
  if (id === 'dashboard') return <DashboardPlaceholder />;
  if (id === 'map') return <MapPlaceholder />;
  if (id === 'youtube') {
    return <YouTubePlaceholder surface={layout.youtube.surface} player={layout.youtube.player} mode={layout.youtube.mode} />;
  }
  const web = lastWeb.get(id);
  return web ? <WebPlaceholder app={web} surfaceId={id} /> : null;
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
