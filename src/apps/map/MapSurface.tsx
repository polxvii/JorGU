// Map app surface (spec §7): mode A (one Maps JavaScript map), mode B (Maps Embed, no charge), or a "not set up"
// panel where Navigate still works. Our large controls stay clear of the mini player (§6.6).
import { useCallback, useMemo } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon, type IconName } from '../../shell/Icon';
import { type Rect, intersects } from '../../shell/geometry';
import { DEFAULT_CENTER, MAPS_KEY } from './config';
import { kmh, useGeo } from './geo';
import { attachMap, endRoute, recenter, setTraffic, showRouteOverview, useMapUi, zoomBy } from './mapController';
import { mapsNavigateUrl } from './navigate';
import { progress } from './routeMath';

const BTN = 56;
const GAP = 8;

function MapButton({ icon, label, onClick, active, testId }: { icon: IconName; label: string; onClick: () => void; active?: boolean; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${
        active ? 'bg-accent text-on-accent' : 'bg-surface text-text'
      }`}
    >
      <Icon name={icon} size={28} />
    </button>
  );
}

function EmbedFrame() {
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
      className="absolute inset-0 h-full w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading="eager"
    />
  );
}

function BarButton({ testId, icon, label, onClick }: { testId: string; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" data-testid={testId} aria-label={label} title={label} onClick={onClick} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg">
      <Icon name={icon} size={22} />
    </button>
  );
}

/**
 * Slim route bar beside the control column (user feedback 2026-11-11: the old card and its big Navigate button
 * covered the map). Time left, then distance and arrival; whole-route view; Google Maps hand-off; end.
 */
function RouteBar({ top, topPx, left }: { top: boolean; topPx: number; left: boolean }) {
  const t = useT();
  const route = useMapUi((s) => s.route);
  const mode = useMapUi((s) => s.mode);
  const pos = useGeo((s) => s.pos);
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
    <div
      data-testid="map-route"
      data-status={route.status}
      title={route.destination}
      className={`absolute flex max-w-[min(340px,calc(100%-88px))] items-center gap-1.5 rounded-2xl bg-surface/95 p-1.5 pl-3 shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${left ? 'left-3' : 'right-3'}`}
      style={top ? { top: topPx } : { bottom: 12 }}
    >
      <div className="min-w-0 flex-1">
        {time && <div className="tabular text-[18px] font-bold leading-tight text-accent" data-testid="map-route-time">{time}</div>}
        <div className="line-clamp-2 text-[13px] leading-tight text-text-dim" data-testid="map-route-detail">{detail || route.destination}</div>
      </div>
      {line && <BarButton testId="map-route-overview" icon="map" label={t('map.routeOverview')} onClick={showRouteOverview} />}
      {/* Voice guidance: hands the trip to the Google Maps app, only when tapped. */}
      <a
        href={mapsNavigateUrl(route.destination)}
        target="_blank"
        rel="noopener"
        data-testid="map-route-navigate"
        aria-label={t('map.navigateGoogle')}
        title={t('map.navigateGoogle')}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg"
      >
        <Icon name="external" size={22} />
      </a>
      <BarButton testId="map-route-end" icon="close" label={t('map.endRoute')} onClick={endRoute} />
    </div>
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
 * `size`: the surface size; `avoid`: the mini player (+ handle) relative to the surface; `band`: top space kept for
 * the pane header and the ⛶ button (0 in full screen).
 */
export function MapSurface({ size, avoid, band }: { size: { w: number; h: number }; avoid: Rect | null; band: number }) {
  const t = useT();
  const mode = useMapUi((s) => s.mode);
  const notice = useMapUi((s) => s.notice);
  // A route in the free Embed view covers the interactive map (mode B, route line off, or fallback).
  const embedRoute = useMapUi((s) => !!s.route?.viaEmbed);
  const follow = useSettings((s) => s.map.follow);
  const trafficOn = useSettings((s) => s.map.traffic);
  const driverRight = useSettings((s) => s.layout.driverSide) === 'right';
  const openSheet = useUi((s) => s.openSheet);
  const pos = useGeo((s) => s.pos);
  const geoError = useGeo((s) => s.error);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) attachMap(node);
  }, []);

  const buttons = mode === 'js' && !embedRoute ? 5 : 2;
  const colH = buttons * BTN + (buttons - 1) * GAP;
  const top = Math.max(GAP, band + 4);
  const colAt = (right: boolean): Rect => ({ x: right ? size.w - GAP - BTN : GAP, y: top, w: BTN, h: colH + 80 });
  // Controls on the driver side, unless the mini player is there.
  const onRight = avoid && intersects(colAt(driverRight), avoid) ? !driverRight : driverRight;
  const routeTop = !(avoid && avoid.y < size.h / 2);
  const hasRoute = useMapUi((s) => !!s.route);
  const speed = kmh(pos?.speed ?? null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg" data-testid="map-surface" data-mode={mode}>
      {/* The map container: created once, never moved (§6.3). Kept even in mode B so mode A can come back. */}
      <div
        ref={containerRef}
        data-testid="map-canvas"
        className="absolute inset-0"
        style={{ visibility: mode === 'js' && !embedRoute ? 'visible' : 'hidden' }}
      />
      {(mode === 'embed' || (mode === 'js' && embedRoute)) && <EmbedFrame />}
      {mode === 'none' && <NotSetUp />}
      {mode !== 'none' && (
        <>
          <div
            className="absolute flex flex-col"
            style={{ top, gap: GAP, [onRight ? 'right' : 'left']: GAP }}
            data-testid="map-controls"
            data-side={onRight ? 'right' : 'left'}
          >
            <MapButton testId="map-navigate" icon="search" label={t('map.whereTo')} onClick={() => openSheet({ kind: 'map' })} />
            <MapButton testId="map-recenter" icon="target" label={t('map.recenter')} active={follow && !!pos} onClick={recenter} />
            {mode === 'js' && !embedRoute && (
              <>
                <MapButton testId="map-traffic" icon="traffic" label={t('map.traffic')} active={trafficOn} onClick={() => setTraffic(!trafficOn)} />
                <MapButton testId="map-zoom-in" icon="plus" label={t('map.zoomIn')} onClick={() => zoomBy(1)} />
                <MapButton testId="map-zoom-out" icon="minus" label={t('map.zoomOut')} onClick={() => zoomBy(-1)} />
              </>
            )}
            {speed !== null && (
              <div data-testid="map-speed" className="tabular flex h-16 w-14 flex-col items-center justify-center rounded-2xl bg-surface text-text shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
                <span className="text-[22px] font-bold leading-none">{speed}</span>
                <span className="text-[11px]">{t('map.kmh')}</span>
              </div>
            )}
          </div>
          <RouteBar top={routeTop} topPx={top} left={onRight} />
          {(notice || geoError) && (
            <div
              role="status"
              data-testid="map-notice"
              className={`absolute max-w-[60%] rounded-xl bg-surface/95 px-3 py-2 text-[13px] text-text-dim ${onRight ? 'right-3' : 'left-3'} ${hasRoute && !routeTop ? 'bottom-[76px]' : 'bottom-3'}`}
            >
              {notice ? t(notice) : t(geoError === 'denied' ? 'map.locationOff' : 'map.locationUnavailable')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
