// Map app surface (spec §7): mode A (one Maps JavaScript map), mode B (Maps Embed, no charge), or a "not set up"
// panel where Navigate still works. Our controls stay clear of the mini player and the full-screen bar (§6.6);
// placement rules live in mapChrome.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { STRIP_BUTTON, SideStrip, StripButton, type StripItem } from '../../shell/SideStrip';
import type { Rect } from '../../shell/geometry';
import { useControlSize } from '../../shell/useControlSize';
import { DEFAULT_CENTER, MAPS_KEY } from './config';
import { kmh, useGeo } from './geo';
import { CAR_SHIFT_MAX, attachMap, chooseRoute, endRoute, openChooser, recenter, refollow, setTraffic, shiftCar, showRouteOverview, useMapUi, zoomBy } from './mapController';
import { exitFullscreen, switchFullscreen } from '../../shell/fullscreen';
import { mapsNavigateUrl } from './navigate';
import { navigateInPlace } from '../web/webHistory';
import { MAP_GAP, placeMapChrome, placePad } from './mapChrome';
import { pathLength, remaining } from './routeMath';
import { type TrafficLevel, trafficMillisLeft, tripBar } from './routeTraffic';
import { intersects } from '../../shell/geometry';
import { L } from '../../shell/computeLayout';

const BUTTON = STRIP_BUTTON;
const MapButton = StripButton;

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
  // Later URLs replace the page in place: no history step, so a Web pane's Back never steps this frame instead.
  const [first] = useState(src);
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (src !== first) navigateInPlace(ref.current, src);
  }, [src, first]);
  return (
    <iframe
      ref={ref}
      title={t('apps.map')}
      data-testid="map-embed"
      data-src={src}
      src={first}
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
  const at = useSettings((s) => s.map.routeInfoAt);
  const setAt = useSettings((s) => s.setRouteInfoAt);
  if (!route) return null;
  const line = mode === 'js' && !route.viaEmbed && route.path.length > 1;
  let time = '';
  let detail = '';
  if (route.status === 'ready' && line) {
    const along = route.along ?? 0;
    const p = remaining(along, route.path, route.distanceMeters, route.durationMillis);
    // With traffic per section known (Compute Routes Pro), the time left counts the traffic.
    if (route.traffic) {
      const pace = route.distanceMeters > 0 ? route.durationMillis / route.distanceMeters : undefined;
      p.millisLeft = trafficMillisLeft(route.traffic.sections, along, pace) || p.millisLeft;
    }
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
      className="absolute flex flex-col justify-center gap-0.5 rounded-2xl bg-surface/95 px-4 text-left shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {time && <span className="tabular block text-[28px] font-bold leading-none text-accent" data-testid="map-route-time">{time}</span>}
      <span className="line-clamp-2 block text-[16px] font-semibold leading-tight text-text" data-testid="map-route-detail">{detail || route.destination}</span>
      {time && route.description && (
        <span className="block truncate text-[13px] leading-tight text-text-dim" data-testid="map-route-name">
          {t('map.routeVia', { via: route.description })}
        </span>
      )}
    </button>
  );
}

/**
 * Route choices (user 2026-11-13): up to 3, fastest first, each with its time in traffic. Beside the route box (above
 * it when the box is at the bottom), never over the toolbar. Tap one to drive it; ✕ keeps the one shown.
 */
function RouteChooser({ box, height, top }: { box: Rect; height: number; top: number }) {
  const t = useT();
  const route = useMapUi((s) => s.route);
  if (!route?.choosing || route.options.length < 2) return null;
  const below = box.y < height / 2;
  const room = below ? height - (box.y + box.h + MAP_GAP) - MAP_GAP : box.y - MAP_GAP - top;
  return (
    <div
      data-testid="map-route-chooser"
      className="absolute flex flex-col gap-1.5 overflow-y-auto rounded-2xl bg-surface/95 p-2 shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
      style={{ left: box.x, width: box.w, maxHeight: Math.max(120, room), ...(below ? { top: box.y + box.h + MAP_GAP } : { bottom: height - box.y + MAP_GAP }) }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[14px] font-semibold text-text-dim">{t('map.chooseRoute')}</span>
        <button
          type="button"
          data-testid="map-route-chooser-close"
          aria-label={t('map.keepRoute')}
          onClick={() => chooseRoute(route.chosen)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      {route.options.map((o, i) => {
        const km = (o.distanceMeters / 1000).toFixed(o.distanceMeters < 10000 ? 1 : 0);
        return (
          <button
            key={i}
            type="button"
            data-testid={`map-route-option-${i}`}
            aria-pressed={i === route.chosen}
            onClick={() => chooseRoute(i)}
            className={`flex min-h-16 flex-col justify-center rounded-xl border-2 px-3 text-left ${i === route.chosen ? 'border-accent bg-bg' : 'border-transparent bg-bg'}`}
          >
            <span className="flex items-center gap-2">
              <span className="tabular text-[22px] font-bold leading-none">{t('map.routeMin', { min: Math.max(1, Math.round(o.durationMillis / 60000)) })}</span>
              {i === 0 && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-semibold text-on-accent">{t('map.fastest')}</span>}
            </span>
            <span className="truncate text-[14px] text-text-dim">{o.description ? t('map.optionDetail', { km, via: o.description }) : t('map.optionKm', { km })}</span>
          </button>
        );
      })}
    </div>
  );
}

const LEVEL_COLOUR: Record<TrafficLevel, string> = { free: '#1E8E3E', slow: '#F29900', jam: '#D93025', unknown: '#9AA0A6' };
/**
 * Behind the car: the same colours 25 % faded, mixed solid so the map doesn't show through. (50 % from a mock,
 * 2026-11-13, read as grey on the car screen: user 2026-11-17.)
 */
const PASSED_COLOUR: Record<TrafficLevel, string> = { free: '#56AA6E', slow: '#F5B340', jam: '#E3645C', unknown: '#B3B8BC' };
/** The car's dot: Google's location blue whatever the theme (a grey accent hid it: user 2026-11-17). */
const CAR_BLUE = '#1A73E8';
const CAR_DOT = 18;
export const TRAFFIC_BAR_W = 12;

/**
 * Traffic along the route (user 2026-11-13): a bar beside the map's toolbar, start at the bottom and destination at
 * the top, green / orange / red per section; the car's blue dot climbs it, the stretch behind it faded. The route
 * line itself stays one solid blue line. The bar is the whole trip from where the route was started, also after a
 * new route from where the car is (user 2026-11-18).
 */
function TrafficBar({ rect }: { rect: Rect }) {
  const t = useT();
  const route = useMapUi((s) => s.route);
  if (!route || route.path.length < 2) return null;
  const { total, along, pieces } = tripBar(route.driven, route.traffic?.sections ?? [], route.along ?? 0, pathLength(route.path));
  if (!pieces.length || total <= 0) return null;
  const progress = along / total;
  // The bar sits 8 px inside the box at both ends, so the car's dot fits at the start and at the destination.
  const inner = rect.h - 16;
  return (
    <div
      data-testid="map-traffic-bar"
      data-progress={progress.toFixed(2)}
      role="img"
      aria-label={t('map.trafficAhead')}
      className="pointer-events-none absolute"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="absolute inset-x-0 overflow-hidden rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]" style={{ top: 8, height: inner, background: LEVEL_COLOUR.unknown }}>
        {pieces.map((p, i) => (
          <div
            key={i}
            data-level={p.level}
            data-passed={p.passed ? '1' : '0'}
            className="absolute inset-x-0"
            style={{ bottom: `${p.from * 100}%`, height: `${(p.to - p.from) * 100}%`, background: (p.passed ? PASSED_COLOUR : LEVEL_COLOUR)[p.level] }}
          />
        ))}
      </div>
      <div className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#D93025] ring-2 ring-white" style={{ top: 3 }} />
      <div
        data-testid="map-traffic-bar-car"
        className="absolute left-1/2 -translate-x-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
        style={{ width: CAR_DOT, height: CAR_DOT, background: CAR_BLUE, bottom: 8 + progress * inner - CAR_DOT / 2 }}
      />
    </div>
  );
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function NotSetUp({ fullscreen }: { fullscreen: boolean }) {
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
      {/* No toolbar here, so the way out of full screen is a button of its own. */}
      {fullscreen && (
        <button type="button" data-testid="map-exit-fs" onClick={() => exitFullscreen('button')} className="min-h-14 rounded-xl bg-surface px-5 text-[16px] font-semibold text-text">
          {t('fs.exit')}
        </button>
      )}
    </div>
  );
}

/** Pad auto-closes after this long without a tap. */
const PAD_HIDE_MS = 8000;
const PAD_GAP = 4;

/**
 * Arrows that move the car's place on the map (user 2026-11-27), like Google Maps' arrows: ← puts the car further
 * left, so more map shows on the right. The middle button puts it back.
 */
function CarPad({ rect, onUse }: { rect: Rect; onUse: () => void }) {
  const t = useT();
  const shift = useSettings((s) => s.map.carShift);
  const arrow = (key: string, icon: 'up' | 'down' | 'back' | 'forward', dx: number, dy: number, end: boolean) => (
    <StripButton
      key={key}
      testId={`map-pad-${key}`}
      icon={icon}
      label={t(`map.car.${key}` as 'map.car.up')}
      disabled={end}
      onClick={() => {
        shiftCar(dx, dy);
        onUse();
      }}
    />
  );
  const step = 0.1;
  const cell = (n: number) => <span key={`gap${n}`} />;
  return (
    <div
      data-testid="map-pad"
      data-shift={`${shift.x},${shift.y}`}
      className="absolute grid grid-cols-3 grid-rows-3"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, gap: PAD_GAP }}
    >
      {cell(1)}
      {arrow('up', 'up', 0, -step, shift.y <= -CAR_SHIFT_MAX)}
      {cell(2)}
      {arrow('left', 'back', -step, 0, shift.x <= -CAR_SHIFT_MAX)}
      <StripButton
        testId="map-pad-center"
        icon="center"
        label={t('map.car.center')}
        disabled={shift.x === 0 && shift.y === 0}
        onClick={() => {
          shiftCar(0, 0);
          onUse();
        }}
      />
      {arrow('right', 'forward', step, 0, shift.x >= CAR_SHIFT_MAX)}
      {cell(3)}
      {arrow('down', 'down', 0, step, shift.y >= CAR_SHIFT_MAX)}
      {cell(4)}
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
  // band 0: the map is full screen (no pane header).
  const fullscreen = band === 0;
  const fsPane = useSettings((s) => s.layout.fullscreenPane);
  const [pad, setPad] = useState(false);
  const [padNonce, setPadNonce] = useState(0);
  useEffect(() => {
    if (!pad) return;
    const id = window.setTimeout(() => setPad(false), PAD_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [pad, padNonce]);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) attachMap(node);
  }, []);

  const live = mode === 'js' && !embedRoute;
  // Toolbar, most needed first: what doesn't fit the strip goes under More (user 2026-11-12). Order (user
  // 2026-11-13): search, my location, traffic, zoom, the route's buttons, and Google Maps last (rarely used).
  // Full screen (user 2026-11-27): a tap shows this toolbar, so the way out (✕) and ⇄ / the app picker are in it.
  const items: StripItem[] = [
    { key: 'search', node: <MapButton testId="map-navigate" icon="search" label={t('map.whereTo')} onClick={() => openSheet({ kind: 'map' })} /> },
    ...(fullscreen ? [{ key: 'exitFs', node: <MapButton testId="map-exit-fs" icon="close" active label={t('fs.exit')} onClick={() => exitFullscreen('button')} /> }] : []),
    { key: 'recenter', node: <MapButton testId="map-recenter" icon="target" label={t('map.recenter')} active={follow && !!pos} onClick={recenter} /> },
  ];
  if (live) {
    items.push(
      { key: 'traffic', node: <MapButton testId="map-traffic" icon="traffic" label={t('map.traffic')} active={trafficOn} onClick={() => setTraffic(!trafficOn)} /> },
      { key: 'zoomIn', node: <MapButton testId="map-zoom-in" icon="plus" label={t('map.zoomIn')} onClick={() => zoomBy(1)} /> },
      { key: 'zoomOut', node: <MapButton testId="map-zoom-out" icon="minus" label={t('map.zoomOut')} onClick={() => zoomBy(-1)} /> },
    );
  }
  if (route) {
    // "Other routes" right after zoom out (user 2026-11-18), then the whole route.
    if (line && route.options.length > 1) {
      items.push({
        key: 'alts',
        node: (
          <MapButton
            testId="map-route-alts"
            icon="routes"
            label={t('map.routeOptions')}
            active={route.choosing}
            onClick={() => (route.choosing ? chooseRoute(route.chosen) : openChooser())}
          />
        ),
      });
    }
    if (line) items.push({ key: 'overview', node: <MapButton testId="map-route-overview" icon="map" label={t('map.routeOverview')} onClick={showRouteOverview} /> });
    items.push({ key: 'end', node: <MapButton testId="map-route-end" icon="close" label={t('map.endRoute')} onClick={endRoute} /> });
  }
  if (live) {
    items.push({
      key: 'pad',
      node: (
        <MapButton
          testId="map-move-car"
          icon="move"
          label={t('map.moveCar')}
          active={pad}
          onClick={() => {
            setPad((p) => !p);
            setPadNonce((n) => n + 1);
          }}
        />
      ),
    });
  }
  if (fullscreen && fsPane !== null) {
    items.push(
      { key: 'switchFs', node: <MapButton testId="map-switch-fs" icon="swap" label={t('fs.switch')} onClick={() => switchFullscreen()} /> },
      { key: 'pickerFs', node: <MapButton testId="map-picker-fs" icon="apps" label={t('fs.picker')} onClick={() => openSheet({ kind: 'picker', pane: fsPane })} /> },
    );
  }
  if (route) {
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
    );
  }

  const top = Math.max(MAP_GAP, band + 4);
  // The pane's ⛶ button (top corner, driver side): normally over the toolbar strip; the route box keeps clear of it.
  const fs = band > 0 ? [{ x: driverRight ? size.w - L.FS_BUTTON - L.FS_MARGIN : L.FS_MARGIN, y: L.FS_MARGIN, w: L.FS_BUTTON, h: L.FS_BUTTON }] : [];
  // The route box's corner is worked out even without a route: the speed sits there then (user 2026-11-13). At the
  // top it's flush with the edge (user 2026-11-17); the pane header keeps beside it (topBox below).
  const ui = placeMapChrome({
    w: size.w,
    h: size.h,
    top,
    boxTop: MAP_GAP,
    btn: cs.map,
    items: items.length,
    right: driverRight,
    avoid: [...avoid, ...fs],
    routeBox: true,
    routeBoxAt: routeInfoAt,
  });
  const speed = kmh(pos?.speed ?? null);
  const box = route ? ui.routeBox : null;
  const bar = (() => {
    if (!line || !trafficOn || !(route.traffic || route.driven.sections.length)) return null;
    const x = ui.right ? ui.canvas.x + ui.canvas.w - TRAFFIC_BAR_W - 10 : ui.canvas.x + 10;
    let top = Math.max(MAP_GAP, band + 8);
    let bottom = size.h - MAP_GAP;
    const col = { x: x - 2, y: 0, w: TRAFFIC_BAR_W + 4, h: size.h };
    for (const a of [...avoid, ...(box ? [box] : [])]) {
      if (!intersects(a, col)) continue;
      if (a.y + a.h / 2 < size.h / 2) top = Math.max(top, a.y + a.h + MAP_GAP);
      else bottom = Math.min(bottom, a.y - MAP_GAP);
    }
    return bottom - top >= 80 ? { x, y: top, w: TRAFFIC_BAR_W, h: bottom - top } : null;
  })();
  // Speed beside the route box (user 2026-11-13), in its corner without a route; above / below it when there's no
  // room beside; never over the mini player, the full-screen bar or the traffic bar.
  const speedBox = (() => {
    const c = ui.routeBox;
    if (speed === null || mode === 'none' || !c) return null;
    const W = 76;
    const fits = (r: Rect) =>
      r.x >= ui.canvas.x && r.x + r.w <= ui.canvas.x + ui.canvas.w && r.y >= 0 && r.y + r.h <= size.h && !avoid.some((a) => intersects(a, r)) && !(bar && intersects(bar, r));
    const atCorner = { x: ui.right ? c.x : c.x + c.w - W, y: c.y, w: W, h: c.h };
    if (!box) return fits(atCorner) ? atCorner : null;
    const beside = { x: ui.right ? c.x + c.w + MAP_GAP : c.x - MAP_GAP - W, y: c.y, w: W, h: c.h };
    if (fits(beside)) return beside;
    if (route?.choosing) return null; // the chooser opens beside the box
    const stacked = { ...atCorner, y: c.y > size.h / 2 ? c.y - MAP_GAP - c.h : c.y + c.h + MAP_GAP };
    return fits(stacked) ? stacked : null;
  })();
  const padRect =
    pad && live
      ? placePad({
          canvas: ui.canvas,
          h: size.h,
          size: 3 * cs.map + 2 * PAD_GAP,
          right: ui.right,
          avoid: [...avoid, ...fs, ...[box, speedBox, bar].filter((r): r is Rect => !!r)],
        })
      : null;
  const canvas = mode === 'none' ? { x: 0, y: 0, w: size.w, h: size.h } : ui.canvas;
  const side = ui.right ? 'right' : 'left';
  // What sits in the header band (route box, speed beside it): the pane header keeps beside it (PaneChrome).
  const atTop = mode === 'none' || band === 0 ? [] : [box, speedBox].filter((r): r is Rect => !!r && r.y < band);
  const topBox = atTop.length ? atTop.reduce(union) : null;

  // Pane ↔ full screen, strip width: the car's place on screen depends on the map's size.
  useEffect(() => refollow(), [canvas.w, canvas.h]);
  useEffect(() => {
    useMapUi.setState({ topBox });
  }, [topBox?.x, topBox?.y, topBox?.w, topBox?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => useMapUi.setState({ topBox: null }), []);

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
      {mode === 'none' && <NotSetUp fullscreen={fullscreen} />}
      {mode !== 'none' && (
        <>
          <SideStrip
            prefix="map"
            ui={ui}
            items={items}
            height={size.h}
            moreLabel={t('map.more')}
          />
          {speedBox && speed !== null && (
            <div
              data-testid="map-speed"
              className="tabular absolute flex flex-col items-center justify-center rounded-2xl bg-surface/95 text-text shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
              style={{ left: speedBox.x, top: speedBox.y, width: speedBox.w, height: speedBox.h }}
            >
              <span className="text-[30px] font-bold leading-none">{speed}</span>
              <span className="text-[12px] font-semibold text-text-dim">{t('map.kmh')}</span>
            </div>
          )}
          {box && <RouteBox rect={box} />}
          {box && <RouteChooser box={box} height={size.h} top={Math.max(MAP_GAP, band + 8)} />}
          {bar && <TrafficBar rect={bar} />}
          {padRect && <CarPad rect={padRect} onUse={() => setPadNonce((n) => n + 1)} />}
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
