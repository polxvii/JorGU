// The one Google map of the app (spec §7.1, §6.3): created once per page load (each `new Map` is a billed load),
// inside a container that is never re-parented. Mode B (Embed) takes over when the cost rule says so (§7.1).
import { create } from 'zustand';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import type { MessageKey } from '../../i18n';
import { DEFAULT_CENTER, MAP_ID, mapsConfigured } from './config';
import { type Position, useGeo } from './geo';
import { type GMap, type GMarker, type GLayer, type GPolyline, type MapsLibs, loadMaps, onMapsAuthFailure } from './mapsLoader';
import { routeEdges } from './routeEdges';
import { RECOMPUTE_MIN_MS, type LL, aheadBearing, bearing, cameraCenter, haversine, progress, turn } from './routeMath';
import { canSpend, useMapUsage } from './usage';

export type MapMode = 'js' | 'embed' | 'none';

export interface RouteState {
  destination: string;
  status: 'loading' | 'ready' | 'error' | 'needsLocation' | 'capped';
  path: LL[];
  distanceMeters: number;
  durationMillis: number;
  computedAt: number;
  /** Shown with the free Embed directions view (mode B, the route line is off, or it couldn't be drawn). */
  viaEmbed: boolean;
  /** Why the free view is used instead of the live line. */
  note: MessageKey | null;
}

interface MapUi {
  mode: MapMode;
  notice: MessageKey | null;
  ready: boolean;
  route: RouteState | null;
  /** Bumped to reload the Embed iframe at the current position (mode B "Recenter"). */
  embedNonce: number;
}

export const useMapUi = create<MapUi>()(() => ({ mode: 'none', notice: null, ready: false, route: null, embedNonce: 0 }));

let el: HTMLElement | null = null;
let libs: MapsLibs | null = null;
let map: GMap | null = null;
let creating = false;
let marker: GMarker | null = null;
let markerDot: HTMLElement | null = null;
let traffic: GLayer | null = null;
// The route line: a solid centre line (Traffic off) or two edges with the traffic colour between them (Traffic on).
let linePath: LL[] = [];
let centreLine: GPolyline | null = null;
let edgeLines: GPolyline[] = [];
let edgeZoom = NaN;
let lineFrame = 0;
let destMarker: GMarker | null = null;

/** Which map to show now: none without a key; Embed if chosen in Settings, or when the cost rule stops mode A. */
export function decideMode(): MapMode {
  if (!mapsConfigured()) return 'none';
  if (map) return useSettings.getState().map.mode === 'embed' ? 'embed' : 'js';
  if (useSettings.getState().map.mode === 'embed') return 'embed';
  return canSpend('map') ? 'js' : 'embed';
}

function setMode(mode: MapMode, notice: MessageKey | null = null): void {
  useMapUi.setState({ mode, ...(notice ? { notice } : {}) });
}

async function ensureMap(): Promise<void> {
  if (map || creating || !el || decideMode() !== 'js') return;
  creating = true;
  try {
    const s = useSettings.getState();
    libs = await loadMaps(s.language);
    if (map) return;
    // Checked again right before the billed event.
    if (!canSpend('map')) {
      setMode('embed', 'map.capped');
      return;
    }
    useMapUsage.getState().record('map');
    const pos = useGeo.getState().pos;
    map = new libs.Map(el, {
      center: pos ? { lat: pos.lat, lng: pos.lng } : DEFAULT_CENTER,
      zoom: 15,
      mapId: MAP_ID,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      // Fixed for this load: changing it means a new map (another billed load).
      colorScheme: useUi.getState().isNight ? libs.ColorScheme.DARK : libs.ColorScheme.LIGHT,
    });
    map.addListener('dragstart', () => {
      cancelAnimationFrame(anim);
      if (useSettings.getState().map.follow) useSettings.getState().setMapFollow(false);
    });
    // The route edges are spaced in screen pixels: redraw them for the new zoom (roughly while zooming, exactly after).
    map.addListener('zoom_changed', () => {
      cancelAnimationFrame(lineFrame);
      lineFrame = requestAnimationFrame(() => drawLine(0.25));
    });
    map.addListener('idle', () => drawLine(0.01));
    traffic = new libs.TrafficLayer();
    if (s.map.traffic) traffic.setMap(map);
    useMapUi.setState({ ready: true });
    updatePosition(useGeo.getState().pos);
  } catch {
    setMode('embed', 'map.loadFailed');
  } finally {
    creating = false;
  }
}

/** The Map surface hands over its container once. */
export function attachMap(container: HTMLElement): void {
  if (el) return;
  el = container;
  setMode(decideMode(), mapsConfigured() && useSettings.getState().map.mode !== 'embed' && !canSpend('map') ? 'map.capped' : null);
  useGeo.getState().start();
  void ensureMap();
}

function updatePosition(pos: Position | null): void {
  if (!pos) return;
  const here = { lat: pos.lat, lng: pos.lng };
  if (map && libs) {
    if (!marker) {
      markerDot = document.createElement('div');
      markerDot.className = 'jg-map-me';
      marker = new libs.AdvancedMarkerElement({ map, position: here, content: markerDot, title: 'me' });
    } else {
      marker.position = here;
    }
    if (useSettings.getState().map.follow) follow(pos, false);
    else setArrow(travelHeading(pos));
  }
  // A route waiting for the first position starts now.
  const r = useMapUi.getState().route;
  if (r?.status === 'needsLocation') void computeRoute(r.destination);
  checkRoute(pos);
}

// ---------- camera (user request 2026-11-12) ----------
// Following the car on a drawn route: the map turns so the road ahead points up, and the car sits about 25 % up from
// the bottom so more of the route ahead is on screen. A display choice only: no turn instructions or voice (§7.4).
// Otherwise north up, car in the middle.

/** Car position below the middle of the map while navigating, as a share of the map height. */
const NAV_CAR_BELOW = 0.25;
let camHeading = 0;
let camCenter: LL | null = null;
let lastPos: LL | null = null;
let lastTravel: number | null = null;
let canRotate: boolean | null = null;
let anim = 0;

function navigating(): boolean {
  const r = useMapUi.getState().route;
  return !!map && useMapUi.getState().mode === 'js' && !!r && !r.viaEmbed && r.status === 'ready' && r.path.length > 1 && useSettings.getState().map.follow;
}

/** Direction of travel: the road ahead on the route line, else the GPS course when moving, else from the last fix. */
function travelHeading(pos: Position): number | null {
  const r = useMapUi.getState().route;
  const onLine = r && !r.viaEmbed && r.path.length > 1 ? aheadBearing(pos, r.path) : null;
  if (onLine !== null) return onLine;
  if (pos.heading != null && Number.isFinite(pos.heading) && (pos.speed ?? 0) > 1.5) return pos.heading;
  if (lastPos && haversine(lastPos, pos) > 15) return bearing(lastPos, pos);
  return null;
}

/** The arrow on the blue dot points where the car goes, relative to the (maybe turned) map. */
function setArrow(travel: number | null): void {
  if (travel !== null) lastTravel = travel;
  const t = travel ?? lastTravel ?? 0;
  if (markerDot) markerDot.style.setProperty('--jg-heading', `${Math.round(t - camHeading)}deg`);
}

function glide(center: LL, heading: number, jump: boolean): void {
  if (!map) return;
  cancelAnimationFrame(anim);
  // Raster maps can't turn (Google warns on every heading): known up front, else found out on the first try below.
  if (canRotate === null && map.getRenderingType?.() === 'RASTER') canRotate = false;
  const target = canRotate === false ? 0 : (heading + 360) % 360;
  const cam = (c: LL, h: number) => map?.moveCamera(canRotate === false ? { center: c } : { center: c, heading: h });
  const from = { c: camCenter ?? center, h: camHeading };
  camCenter = center;
  camHeading = target;
  const far = haversine(from.c, center) > 1000;
  if (jump || far || typeof requestAnimationFrame !== 'function') {
    cam(center, target);
  } else {
    const dh = turn(from.h, target);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 800);
      const e = k * (2 - k);
      cam({ lat: from.c.lat + (center.lat - from.c.lat) * e, lng: from.c.lng + (center.lng - from.c.lng) * e }, from.h + dh * e);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  // Raster maps, or a Map ID without rotation, stay north up; the car still sits low on the screen.
  if (canRotate === null && target !== 0 && jump && map.getHeading) {
    canRotate = Math.abs(turn(map.getHeading() ?? 0, target)) < 1;
    if (!canRotate) camHeading = 0;
  }
}

function follow(pos: Position, jump: boolean): void {
  if (!map) return;
  const here = { lat: pos.lat, lng: pos.lng };
  const travel = travelHeading(pos);
  if (!lastPos || haversine(lastPos, here) > 15) lastPos = here;
  if (navigating()) {
    const heading = travel ?? lastTravel ?? camHeading;
    const h = el?.clientHeight ?? 0;
    glide(cameraCenter(here, heading, map.getZoom() ?? DRIVE_ZOOM, h * NAV_CAR_BELOW), heading, jump || canRotate === null);
  } else if (camHeading !== 0) {
    glide(here, 0, true);
  } else {
    cancelAnimationFrame(anim);
    camCenter = here;
    map.panTo(here);
  }
  setArrow(travel);
}

/** The map changed size (pane ↔ full screen, rotation): put the car back at its place on screen. */
export function refollow(): void {
  const pos = useGeo.getState().pos;
  if (map && pos && useSettings.getState().map.follow) follow(pos, true);
}

/** Back to north up (whole-route view, route ended). */
function northUp(): void {
  cancelAnimationFrame(anim);
  if (map && camHeading !== 0 && canRotate !== false) map.moveCamera({ heading: 0 });
  camHeading = 0;
  setArrow(null);
}

// ---------- controls ----------

/** Zoom while following the car on a route: streets and the line ahead, not the whole city. */
export const DRIVE_ZOOM = 16;

export function recenter(): void {
  useSettings.getState().setMapFollow(true);
  const pos = useGeo.getState().pos;
  if (!pos) useGeo.getState().retry();
  // Back from the whole-route view: zoom in to driving level again.
  if (map && (useMapUi.getState().route?.path.length ?? 0) > 1 && (map.getZoom() ?? DRIVE_ZOOM) < DRIVE_ZOOM - 1) map.setZoom(DRIVE_ZOOM);
  if (map && pos) follow(pos, true);
  const ui = useMapUi.getState();
  if (ui.mode === 'embed' || ui.route?.viaEmbed) useMapUi.setState((s) => ({ embedNonce: s.embedNonce + 1 }));
}

export function zoomBy(step: number): void {
  if (map) map.setZoom((map.getZoom() ?? 15) + step);
}

export function setTraffic(on: boolean): void {
  useSettings.getState().setMapTraffic(on);
  traffic?.setMap(on ? map : null);
  drawLine(0);
}

// ---------- route overview (§7.4): line, ETA, distance left; no turn instructions ----------

const num = (v: number | (() => number)) => (typeof v === 'function' ? v() : v);
// Route line (user 2026-11-12). The 50 % see-through line was too faint and a chain of arrows too busy; the user
// picked two edges: with Traffic on, two solid blue lines either side of the route, the Traffic layer's red / orange /
// green on the road showing between them. Traffic off: one solid line. A line coloured by traffic itself ("Traffic
// information on polylines") is the Enterprise route SKU, 1,000 free a month: not used.
const ROUTE_BLUE = '#1A73E8';
export const EDGE_PX = 9;
const LINE = { strokeColor: ROUTE_BLUE, strokeOpacity: 1, clickable: false, zIndex: 2 };
const CENTRE_STYLE = { ...LINE, strokeWeight: 7 };
const EDGE_STYLE = { ...LINE, strokeWeight: 4 };

/** Puts the right route line on the map. Edges are recomputed when the zoom moved by `minZoomStep` or more. */
function drawLine(minZoomStep: number): void {
  if (!map || !libs || linePath.length < 2) return;
  if (!useSettings.getState().map.traffic) {
    for (const e of edgeLines) e.setMap(null);
    centreLine ??= new libs.Polyline({ ...CENTRE_STYLE, path: linePath });
    centreLine.setMap(map);
    return;
  }
  centreLine?.setMap(null);
  const z = map.getZoom() ?? DRIVE_ZOOM;
  if (!edgeLines.length || !(Math.abs(z - edgeZoom) < Math.max(minZoomStep, 1e-6))) {
    edgeZoom = z;
    const edges = routeEdges(linePath, z, EDGE_PX);
    if (!edgeLines.length) edgeLines = edges.map(() => new libs!.Polyline({ ...EDGE_STYLE }));
    edges.forEach((path, i) => edgeLines[i].setPath(path));
  }
  for (const e of edgeLines) e.setMap(map);
}

function clearLine(): void {
  centreLine?.setMap(null);
  for (const e of edgeLines) e.setMap(null);
  centreLine = null;
  edgeLines = [];
  linePath = [];
  edgeZoom = NaN;
  if (destMarker) destMarker.map = null;
  destMarker = null;
}

/** Room around the whole-route view so the route bar and the control column don't cover its ends. */
function routePadding(): number | { top: number; right: number; bottom: number; left: number } {
  const surface = el?.closest('[data-testid="map-surface"]');
  if (!el || !surface) return 64;
  const b = el.getBoundingClientRect();
  const pad = { top: 40, right: 40, bottom: 40, left: 40 };
  const card = surface.querySelector('[data-testid="map-route"]')?.getBoundingClientRect();
  if (card?.height) {
    if (card.top - b.top < b.height / 2) pad.top = card.bottom - b.top + 24;
    else pad.bottom = b.bottom - card.top + 24;
  }
  const ctl = surface.querySelector('[data-testid="map-controls"]')?.getBoundingClientRect();
  if (ctl?.width) {
    if (ctl.left - b.left < b.width / 2) pad.left = ctl.right - b.left + 16;
    else pad.right = b.right - ctl.left + 16;
  }
  // A small pane: keep most of it for the route.
  if (pad.top + pad.bottom > b.height * 0.7 || pad.left + pad.right > b.width * 0.7) return 48;
  return pad;
}

/** The live line can't be drawn: show the route in the free Embed view instead, and say why. */
function fallBack(destination: string, note: MessageKey): void {
  useMapUi.setState((s) =>
    s.route?.destination === destination ? { route: { ...s.route, status: 'ready', viaEmbed: true, note } } : s,
  );
}

async function computeRoute(destination: string): Promise<void> {
  const pos = useGeo.getState().pos;
  const set = (patch: Partial<RouteState>) =>
    useMapUi.setState((s) => (s.route?.destination === destination ? { route: { ...s.route, ...patch } } : s));
  if (!pos) return set({ status: 'needsLocation' });
  if (!canSpend('route')) return fallBack(destination, 'map.routeCapped');
  if (!libs || !map) return fallBack(destination, 'map.routeFallback');
  useMapUsage.getState().record('route');
  set({ status: 'loading', computedAt: Date.now() });
  try {
    const { routes } = await libs.Route.computeRoutes({
      origin: { lat: pos.lat, lng: pos.lng },
      destination,
      travelMode: 'DRIVING',
      // TRAFFIC_UNAWARE keeps it in the Essentials SKU (traffic-aware is Pro).
      routingPreference: 'TRAFFIC_UNAWARE',
      fields: ['durationMillis', 'distanceMeters', 'path'],
      // Avoid tolls / highways: plain route modifiers, still Essentials (not a Pro or Enterprise trigger).
      routeModifiers: { avoidTolls: useSettings.getState().map.avoidTolls, avoidHighways: useSettings.getState().map.avoidHighways },
    });
    const r = routes?.[0];
    if (!r || !r.path?.length) return fallBack(destination, 'map.routeFallback');
    const current = useMapUi.getState().route;
    if (current?.destination !== destination) return;
    // First drawing: follow the car at driving zoom, the line ahead on screen. A recompute after leaving the
    // route keeps the view the driver has. The whole route is one tap away (route bar).
    const first = current.path.length === 0;
    clearLine();
    const path = r.path.map((p) => ({ lat: num(p.lat), lng: num(p.lng) }));
    linePath = path;
    const pin = document.createElement('div');
    pin.className = 'jg-map-dest';
    destMarker = new libs.AdvancedMarkerElement({ map, position: path[path.length - 1], content: pin, title: destination });
    set({ status: 'ready', path, distanceMeters: r.distanceMeters ?? 0, durationMillis: r.durationMillis ?? 0, computedAt: Date.now() });
    if (first) {
      useSettings.getState().setMapFollow(true);
      map.setZoom(DRIVE_ZOOM);
      follow(useGeo.getState().pos ?? pos, true);
    }
    drawLine(0);
  } catch {
    // e.g. Routes API not allowed for this key: still show Google's route, in the free view.
    fallBack(destination, 'map.routeFallback');
  }
}

/**
 * "Show route": the route on the live map (position, traffic) with the Routes API — capped at 320 a day like map
 * loads. The free Embed directions view is used in mode B, when the route line is off in Settings, or as fallback.
 * Opening Google Maps for guidance is a separate button (route card).
 */
export function startRoute(destination: string): void {
  clearLine();
  const line = useMapUi.getState().mode === 'js' && useSettings.getState().map.routeLine;
  useMapUi.setState({
    route: { destination, status: line ? 'loading' : 'ready', path: [], distanceMeters: 0, durationMillis: 0, computedAt: 0, viaEmbed: !line, note: null },
  });
  if (line) void computeRoute(destination);
}

/** Route bar: the whole route on screen; follow pauses until ⌖. */
export function showRouteOverview(): void {
  const r = useMapUi.getState().route;
  if (!map || !libs || !r || r.path.length < 2) return;
  useSettings.getState().setMapFollow(false);
  northUp();
  const bounds = new libs.LatLngBounds();
  for (const p of r.path) bounds.extend(p);
  map.fitBounds(bounds, routePadding());
}

/** "Refresh route": at most once a minute. */
export function refreshRoute(): void {
  const r = useMapUi.getState().route;
  if (!r || r.viaEmbed || useMapUi.getState().mode !== 'js') return;
  if (Date.now() - r.computedAt < RECOMPUTE_MIN_MS && r.status === 'ready') return;
  void computeRoute(r.destination);
}

export function endRoute(): void {
  clearLine();
  useMapUi.setState({ route: null });
  northUp();
  const pos = useGeo.getState().pos;
  if (map && pos && useSettings.getState().map.follow) follow(pos, true);
}

/** > 200 m off the line: recompute, at most once a minute (§7.4). */
function checkRoute(pos: Position): void {
  const r = useMapUi.getState().route;
  if (!r || r.viaEmbed || r.status !== 'ready' || r.path.length < 2 || useMapUi.getState().mode !== 'js') return;
  if (progress(pos, r.path, r.distanceMeters, r.durationMillis).offRoute && Date.now() - r.computedAt >= RECOMPUTE_MIN_MS) {
    void computeRoute(r.destination);
  }
}

// ---------- wiring ----------

onMapsAuthFailure(() => {
  useMapUsage.getState().markRefused('auth');
  setMode('embed', 'map.authFailed');
});
useGeo.subscribe((s, prev) => {
  if (s.pos !== prev.pos) updatePosition(s.pos);
});
useSettings.subscribe((s, prev) => {
  if (s.map.mode !== prev.map.mode) {
    setMode(decideMode());
    void ensureMap();
  }
  // Route options changed during a route: draw it again (the Embed view reloads by itself).
  if (s.map.avoidTolls !== prev.map.avoidTolls || s.map.avoidHighways !== prev.map.avoidHighways) {
    const r = useMapUi.getState().route;
    if (r && !r.viaEmbed && useMapUi.getState().mode === 'js') void computeRoute(r.destination);
  }
});

/** Read-only hook for E2E tests. */
export function debugMap() {
  return { hasMap: !!map, mode: useMapUi.getState().mode, lines: linePath.length ? (useSettings.getState().map.traffic ? edgeLines.length : 1) : 0, heading: camHeading, canRotate };
}
