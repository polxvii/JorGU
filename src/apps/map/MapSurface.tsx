// Map app surface (spec §7): mode A (one Maps JavaScript map), mode B (Maps Embed, no charge), or a "not set up"
// panel where Navigate still works. Our controls stay clear of the mini player and the full-screen bar (§6.6);
// placement rules live in mapChrome.ts.
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon, type IconName } from '../../shell/Icon';
import type { Rect } from '../../shell/geometry';
import { useControlSize } from '../../shell/useControlSize';
import { DEFAULT_CENTER, MAPS_KEY } from './config';
import { kmh, useGeo } from './geo';
import { attachMap, endRoute, recenter, refollow, setTraffic, showRouteOverview, useMapUi, zoomBy } from './mapController';
import { mapsNavigateUrl } from './navigate';
import { MAP_GAP, placeMapChrome } from './mapChrome';
import { progress } from './routeMath';

const BUTTON = 'flex items-center justify-center rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.35)]';

function MapButton({ icon, label, onClick, active, testId }: { icon: IconName; label: string; onClick: () => void; active?: boolean; testId: string }) {
  const cs = useControlSize();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      style={{ width: cs.map, height: cs.map, direction: 'ltr' }}
      className={`${BUTTON} ${active ? 'bg-accent text-on-accent' : 'bg-surface text-text'}`}
    >
      <Icon name={icon} size={cs.mapIcon} />
    </button>
  );
}

function EmbedFrame({ rect }: { rect: Rect }) {
  const t = useT();
  const pos = useGeo((s) => s.pos);
  const route = useMapUi((s) => s.route);
  const nonce = useMapUi((s) => s.embedNonce);
  const avoid = useSettings((s) => [s.map.avoidTolls && 'tolls', s.map.avoidHighways && 'highways'].filter(Boolean).join('|'));
  // Recompute the URL only on Recenter or a new route: every src change reloads the iframe.
  const src = useMemo(() => {
    const here = pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : `${DEFAULT_CENTER.lat},${DEFAULT_CENTER.lng}`;
    if (route) {
      const q = new URLSearchParams({ key: MAPS_KEY, origin: here, destination: route.destination, mode: 'driving' });
      if (avoid) q.set('avoid', avoid);
      return `https://www.google.com/maps/embed/v1/directions?${q}`;
    }
    const q = new URLSearchParams({ key: MAPS_KEY, center: here, zoom: '15' });
    return `https://www.google.com/maps/embed/v1/view?${q}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, route?.destination, !!pos, avoid]);
  return (
    <iframe
      title={t('apps.map')}
      data-testid="map-embed"
      src={src}
      className="absolute border-0"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading="eager"
    />
  );
}

/**
 * Route box: time left, distance and arrival only (user request 2026-11-12); its buttons live in the toolbar.
 * Tap it to move it between the top and bottom corner.
 */
function RouteBox({ rect }: { rect: Rect }) {
  const t = useT();
  const route = useMapUi((s) => s.route);
  const mode = useMapUi((s) => s.mode);
  const pos = useGeo((s) => s.pos);
  const at = useSettings((s) => s.map.routeInfoAt);
  const setAt = useSettings((s) => s.setRouteInfoAt);
  if (!route) return null;
  const line = mode === 'js' && !route.viaEmbed && route.path.length > 1;
  let time = '';
  let detail = '';
  if (route.status === 'ready' && line) {
    const p = pos ? progress(pos, route.path, route.distanceMeters, route.durationMillis) : { metersLeft: route.distanceMeters, millisLeft: route.durationMillis };
    const eta = new Date(Date.now() + p.millisLeft).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    time = t('map.routeMin', { min: Math.max(1, Math.round(p.millisLeft / 60000)) });
    detail = t('map.routeKmEta', { km: (p.metersLeft / 1000).toFixed(p.metersLeft < 10000 ? 1 : 0), eta });
  } else if (route.status === 'loading') detail = t('map.routeLoading');
  else if (route.status === 'needsLocation') detail = t('map.routeNeedsLocation');
  else if (route.note) detail = t(route.note);
  else if (route.status === 'error') detail = t('map.routeError');
  return (
    <button
      type="button"
      data-testid="map-route"
      data-status={route.status}
      data-at={at}
      title={`${route.destination} · ${t('map.routeInfoMove')}`}
      onClick={() => setAt(at === 'top' ? 'bottom' : 'top')}
      className="absolute flex flex-col justify-center rounded-2xl bg-surface/95 px-3 text-left shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {time && <span className="tabular block text-[18px] font-bold leading-tight text-accent" data-testid="map-route-time">{time}</span>}
      <span className="line-clamp-2 block text-[13px] leading-tight text-text-dim" data-testid="map-route-detail">{detail || route.destination}</span>
    </button>
  );
}

function NotSetUp() {
  const t = useT();
  const openSheet = useUi((s) => s.openSheet);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center" data-testid="map-not-set-up">
      <Icon name="map" size={48} className="text-accent" />
      <div className="text-[18px] font-semibold">{t('map.notSetUp')}</div>
      <div className="max-w-md text-[14px] text-text-dim">{t('map.notSetUpBody')}</div>
      <button type="button" data-testid="map-where-to" onClick={() => openSheet({ kind: 'map' })} className="min-h-14 rounded-xl bg-accent px-5 text-[16px] font-semibold text-on-accent">
        {t('map.whereTo')}
      </button>
    </div>
  );
}

/**
 * `size`: the surface size; `avoid`: what to keep clear, relative to the surface (mini player + handle, full-screen
 * floating bar); `band`: top space kept for the pane header and the ⛶ button (0 in full screen).
 */
export function MapSurface({ size, avoid, band }: { size: { w: number; h: number }; avoid: Rect[]; band: number }) {
  const t = useT();
  const cs = useControlSize();
  const mode = useMapUi((s) => s.mode);
  const notice = useMapUi((s) => s.notice);
  const route = useMapUi((s) => s.route);
  // A route in the free Embed view covers the interactive map (mode B, route line off, or fallback).
  const embedRoute = !!route?.viaEmbed;
  const line = mode === 'js' && !!route && !route.viaEmbed && route.path.length > 1;
  const follow = useSettings((s) => s.map.follow);
  const trafficOn = useSettings((s) => s.map.traffic);
  const routeInfoAt = useSettings((s) => s.map.routeInfoAt);
  const driverRight = useSettings((s) => s.layout.driverSide) === 'right';
  const openSheet = useUi((s) => s.openSheet);
  const pos = useGeo((s) => s.pos);
  const geoError = useGeo((s) => s.error);
  const [moreOpen, setMoreOpen] = useState(false);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) attachMap(node);
  }, []);

  const live = mode === 'js' && !embedRoute;
  // Toolbar, most needed first: what doesn't fit the strip goes under More (user 2026-11-12).
  const items: { key: string; node: ReactNode }[] = [
    { key: 'search', node: <MapButton testId="map-navigate" icon="search" label={t('map.whereTo')} onClick={() => openSheet({ kind: 'map' })} /> },
    { key: 'recenter', node: <MapButton testId="map-recenter" icon="target" label={t('map.recenter')} active={follow && !!pos} onClick={recenter} /> },
  ];
  if (live) {
    items.push(
      { key: 'zoomIn', node: <MapButton testId="map-zoom-in" icon="plus" label={t('map.zoomIn')} onClick={() => zoomBy(1)} /> },
      { key: 'zoomOut', node: <MapButton testId="map-zoom-out" icon="minus" label={t('map.zoomOut')} onClick={() => zoomBy(-1)} /> },
    );
  }
  if (route) {
    if (line) items.push({ key: 'overview', node: <MapButton testId="map-route-overview" icon="map" label={t('map.routeOverview')} onClick={showRouteOverview} /> });
    items.push(
      {
        key: 'google',
        // Voice guidance: hands the trip to the Google Maps app, only when tapped.
        node: (
          <a
            href={mapsNavigateUrl(route.destination)}
            target="_blank"
            rel="noopener"
            data-testid="map-route-navigate"
            aria-label={t('map.navigateGoogle')}
            title={t('map.navigateGoogle')}
            style={{ width: cs.map, height: cs.map }}
            className={`${BUTTON} bg-bg text-text`}
          >
            <Icon name="external" size={cs.mapIcon - 4} />
          </a>
        ),
      },
      { key: 'end', node: <MapButton testId="map-route-end" icon="close" label={t('map.endRoute')} onClick={endRoute} /> },
    );
  }
  if (live) items.push({ key: 'traffic', node: <MapButton testId="map-traffic" icon="traffic" label={t('map.traffic')} active={trafficOn} onClick={() => setTraffic(!trafficOn)} /> });

  const top = Math.max(MAP_GAP, band + 4);
  const ui = placeMapChrome({ w: size.w, h: size.h, top, btn: cs.map, items: items.length, right: driverRight, avoid, routeBox: !!route, routeBoxAt: routeInfoAt });
  const shown = items.slice(0, ui.shown);
  const hidden = items.slice(ui.shown);
  const step = cs.map + MAP_GAP;
  const menuH = hidden.length * step - MAP_GAP;
  const menuTop = Math.max(MAP_GAP, Math.min(size.h - MAP_GAP - menuH, ui.buttons.y + ui.shown * step + cs.map - menuH));
  const speed = kmh(pos?.speed ?? null);
  const box = ui.routeBox;
  const canvas = mode === 'none' ? { x: 0, y: 0, w: size.w, h: size.h } : ui.canvas;
  const side = ui.right ? 'right' : 'left';

  // Pane ↔ full screen, strip width: the car's place on screen depends on the map's size.
  useEffect(() => refollow(), [canvas.w, canvas.h]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg" data-testid="map-surface" data-mode={mode}>
      {/* The map container: created once, never moved (§6.3); only its size changes. Kept in mode B too. */}
      <div
        ref={containerRef}
        data-testid="map-canvas"
        className="absolute"
        style={{ left: canvas.x, top: 0, width: canvas.w, height: canvas.h, // 'inherit', never 'visible': a hidden Map surface (YouTube full screen) must hide the map too (user screenshot
        // 2026-11-12: a line of map showed above the full-screen controls).
        visibility: live ? 'inherit' : 'hidden' }}
      />
      {(mode === 'embed' || (mode === 'js' && embedRoute)) && <EmbedFrame rect={canvas} />}
      {mode === 'none' && <NotSetUp />}
      {mode !== 'none' && (
        <>
          <div data-testid="map-strip" className="absolute bg-surface" style={{ left: ui.strip.x, top: 0, width: ui.strip.w, height: size.h }} />
          <div
            className="absolute flex flex-col"
            style={{ left: ui.buttons.x, top: ui.buttons.y, gap: MAP_GAP }}
            data-testid="map-controls"
            data-side={side}
          >
            {shown.map((i) => (
              <Fragment key={i.key}>{i.node}</Fragment>
            ))}
            {ui.more && <MapButton testId="map-more" icon="more" label={t('map.more')} active={moreOpen} onClick={() => setMoreOpen((o) => !o)} />}
            {ui.speed && speed !== null && (
              <div
                data-testid="map-speed"
                style={{ width: cs.map, height: cs.map }}
                className="tabular flex flex-col items-center justify-center rounded-2xl bg-bg text-text"
              >
                <span className="text-[22px] font-bold leading-none">{speed}</span>
                <span className="text-[11px]">{t('map.kmh')}</span>
              </div>
            )}
          </div>
          {ui.more && moreOpen && (
            // Opens over the map beside the strip; any choice closes it.
            <div
              data-testid="map-more-menu"
              className="absolute flex flex-col"
              style={{ top: menuTop, [side]: ui.strip.w + MAP_GAP, gap: MAP_GAP }}
              onClick={() => setMoreOpen(false)}
            >
              {hidden.map((i) => (
                <Fragment key={i.key}>{i.node}</Fragment>
              ))}
            </div>
          )}
          {box && <RouteBox rect={box} />}
          {(notice || geoError) && (
            <div
              role="status"
              data-testid="map-notice"
              className="absolute rounded-xl bg-surface/95 px-3 py-2 text-[13px] text-text-dim"
              style={{
                [side]: ui.strip.w + 12,
                maxWidth: Math.max(160, canvas.w - 24 - (box ? box.w + 12 : 0)),
                ...(box && box.y > size.h / 2 ? { bottom: size.h - box.y - box.h } : { bottom: 12 }),
              }}
            >
              {notice ? t(notice) : t(geoError === 'denied' ? 'map.locationOff' : 'map.locationUnavailable')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
