// The one Google map of the app (spec §7.1, §6.3): created once per page load (each `new Map` is a billed load),
// inside a container that is never re-parented. Mode B (Embed) takes over when the cost rule says so (§7.1).
import { create } from 'zustand';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import type { MessageKey } from '../../i18n';
import { DEFAULT_CENTER, MAP_ID, mapsConfigured } from './config';
import { type Position, useGeo } from './geo';
import { type GMap, type GMarker, type GLayer, type GPolyline, type MapsLibs, loadMaps, onMapsAuthFailure } from './mapsLoader';
import { type TrafficSection, sectionPlan, sectionsFromLegs, slowStretches } from './routeTraffic';
import { OFF_ROUTE_M, RECOMPUTE_MIN_MS, type LL, aheadBearing, bearing, cameraCenter, haversine, progress, projectOnPath, turn } from './routeMath';
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
  /** Traffic per section of the road ahead (Compute Routes Pro), for the side bar and the ETA; null until known. */
  traffic: { sections: TrafficSection[]; at: number } | null;
  /** Google's route choices (up to 3, traffic-aware), fastest first; `chosen` is the one drawn and followed. */
  options: RouteOption[];
  chosen: number;
  /** The route chooser is open: the other choices show grey on the map. */
  choosing: boolean;
  /** The chosen route's name from Google ("via ..."), when known. */
  description: string;
}

export interface RouteOption {
  path: LL[];
  distanceMeters: number;
  durationMillis: number;
  description: string;
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
// The route line: one solid line (user 2026-11-13); traffic on the route is the side bar (routeTraffic.ts).
let line: GPolyline | null = null;
let casing: GPolyline | null = null;
let slowLines: GPolyline[] = [];
let altLines: GPolyline[] = [];
let chooserTimer = 0;
let trafficTimer = 0;
let trafficBusy = false;
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
      // Fixed for this load: changing it means a new map (another billed load). Day by default (user 2026-11-13).
      colorScheme:
        s.map.colors === 'night' || (s.map.colors === 'auto' && useUi.getState().isNight) ? libs.ColorScheme.DARK : libs.ColorScheme.LIGHT,
    });
    map.addListener('dragstart', () => {
      cancelAnimationFrame(anim);
      if (useSettings.getState().map.follow) useSettings.getState().setMapFollow(false);
    });
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
  paintTraffic();
  // The traffic bar and colours follow the Traffic button: back on, fetch them if they're stale.
  const r = useMapUi.getState().route;
  if (on && r && (!r.traffic || Date.now() - r.traffic.at > TRAFFIC_EVERY_MS)) void refreshTraffic();
}

// ---------- route overview (§7.4): line, ETA, distance left; no turn instructions ----------

const num = (v: number | (() => number)) => (typeof v === 'function' ? v() : v);
// Route line (user 2026-11-13, after a see-through line, a chain of arrows and two edges): one solid blue line, easy to
// see. Traffic on the road ahead is the side bar, from Compute Routes Pro (routeTraffic.ts).
const LINE_STYLE = { strokeColor: '#1A73E8', strokeOpacity: 1, strokeWeight: 7, clickable: false, zIndex: 2 };
// A dark edge so the line stands out from the Traffic layer's colours on the same road.
const CASING_STYLE = { strokeColor: '#0B3B8C', strokeOpacity: 1, strokeWeight: 11, clickable: false, zIndex: 1 };
// Slow / jammed stretches of the route (user 2026-11-13), from the same Pro data as the side bar: no extra request.
const SLOW_COLOUR = { slow: '#F29900', jam: '#D93025' } as const;

/** Paints the slow and jammed stretches over the blue line (only with Traffic on and traffic known). */
function paintTraffic(): void {
  for (const l of slowLines) l.setMap(null);
  slowLines = [];
  const r = useMapUi.getState().route;
  if (!map || !libs || !line || !r?.traffic || !useSettings.getState().map.traffic) return;
  slowLines = slowStretches(r.path, r.traffic.sections).map(
    (s) => new libs!.Polyline({ ...LINE_STYLE, strokeColor: SLOW_COLOUR[s.level], zIndex: 3, path: s.path, map }),
  );
}

function clearLine(): void {
  line?.setMap(null);
  line = null;
  casing?.setMap(null);
  casing = null;
  for (const l of slowLines) l.setMap(null);
  slowLines = [];
  clearAlts();
  if (destMarker) destMarker.map = null;
  destMarker = null;
  clearInterval(trafficTimer);
}

/** How often the traffic bar is fetched again while a route is on (each fetch is one Pro request). */
export const TRAFFIC_EVERY_MS = 5 * 60_000;

/**
 * Traffic per section of the road ahead: one Compute Routes Pro request (traffic-aware) with waypoints on our own
 * route, so Google keeps the same way. Skipped when Traffic is off, the page is hidden, or today's share is used up.
 */
async function refreshTraffic(): Promise<void> {
  const r = useMapUi.getState().route;
  if (!libs || !r || r.viaEmbed || r.status !== 'ready' || r.path.length < 2 || trafficBusy) return;
  if (!useSettings.getState().map.traffic || document.visibilityState === 'hidden' || !canSpend('traffic')) return;
  const pos = useGeo.getState().pos;
  const on = pos ? projectOnPath(pos, r.path) : null;
  const plan = sectionPlan(r.path, on && on.off <= OFF_ROUTE_M ? on.along : 0);
  if (!plan) return;
  const computedAt = r.computedAt;
  trafficBusy = true;
  useMapUsage.getState().record('traffic');
  try {
    const { routes } = await libs.Route.computeRoutes({
      origin: plan.origin,
      destination: plan.destination,
      intermediates: plan.intermediates.map((location) => ({ location })),
      travelMode: 'DRIVING',
      // Traffic-aware + headings: the Pro SKU (5,000 free a month). Not "traffic on polylines" (Enterprise).
      routingPreference: 'TRAFFIC_AWARE',
      fields: ['legs'],
    });
    const legs = routes?.[0]?.legs;
    if (!legs?.length) return;
    useMapUi.setState((s) =>
      s.route && s.route.computedAt === computedAt ? { route: { ...s.route, traffic: { sections: sectionsFromLegs(plan.bounds, legs), at: Date.now() } } } : s,
    );
    paintTraffic();
  } catch {
    // No bar this time (e.g. the key doesn't allow it); the route itself is unaffected.
  } finally {
    trafficBusy = false;
  }
}

function scheduleTraffic(): void {
  clearInterval(trafficTimer);
  trafficTimer = window.setInterval(() => void refreshTraffic(), TRAFFIC_EVERY_MS);
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

const ALT_STYLE = { strokeColor: '#8A94A6', strokeOpacity: 1, strokeWeight: 6, clickable: false, zIndex: 0 };

function clearAlts(): void {
  for (const l of altLines) l.setMap(null);
  altLines = [];
  clearTimeout(chooserTimer);
}

const toOption = (r: { path?: { lat: number | (() => number); lng: number | (() => number) }[]; distanceMeters?: number; durationMillis?: number; description?: string }): RouteOption => ({
  path: (r.path ?? []).map((p) => ({ lat: num(p.lat), lng: num(p.lng) })),
  distanceMeters: r.distanceMeters ?? 0,
  durationMillis: r.durationMillis ?? 0,
  description: r.description ?? '',
});

/**
 * Route choices (user 2026-11-13): one Compute Routes **Pro** request, traffic-aware with alternatives, gives up to 3
 * routes with their time in traffic (live test: the fastest in traffic is often not the shortest). When the Pro
 * share is used up or Google refuses it, one Essentials route (no traffic, no choices); past that, the free view.
 */
async function requestRoutes(origin: LL, destination: string): Promise<RouteOption[] | null> {
  if (!libs) return null;
  const routeModifiers = { avoidTolls: useSettings.getState().map.avoidTolls, avoidHighways: useSettings.getState().map.avoidHighways };
  if (canSpend('traffic')) {
    useMapUsage.getState().record('traffic');
    try {
      const { routes } = await libs.Route.computeRoutes({
        origin,
        destination,
        travelMode: 'DRIVING',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: true,
        fields: ['durationMillis', 'distanceMeters', 'path', 'description'],
        routeModifiers,
      });
      const options = (routes ?? []).map(toOption).filter((o) => o.path.length > 1);
      if (options.length) return options.sort((a, b) => a.durationMillis - b.durationMillis);
    } catch {
      /* try the Essentials route below */
    }
  }
  if (!canSpend('route')) return null;
  useMapUsage.getState().record('route');
  const { routes } = await libs.Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    // TRAFFIC_UNAWARE keeps it in the Essentials SKU (traffic-aware is Pro).
    routingPreference: 'TRAFFIC_UNAWARE',
    fields: ['durationMillis', 'distanceMeters', 'path', 'description'],
    routeModifiers,
  });
  const r = routes?.[0];
  return r?.path?.length ? [toOption(r)] : null;
}

async function computeRoute(destination: string): Promise<void> {
  const pos = useGeo.getState().pos;
  const set = (patch: Partial<RouteState>) =>
    useMapUi.setState((s) => (s.route?.destination === destination ? { route: { ...s.route, ...patch } } : s));
  if (!pos) return set({ status: 'needsLocation' });
  if (!canSpend('traffic') && !canSpend('route')) return fallBack(destination, 'map.routeCapped');
  if (!libs || !map) return fallBack(destination, 'map.routeFallback');
  set({ status: 'loading', computedAt: Date.now() });
  try {
    const options = await requestRoutes({ lat: pos.lat, lng: pos.lng }, destination);
    if (!options) return fallBack(destination, canSpend('route') ? 'map.routeFallback' : 'map.routeCapped');
    const current = useMapUi.getState().route;
    if (current?.destination !== destination) return;
    // First drawing with choices: show them all and let the driver pick (the fastest is picked if they don't).
    // A recompute after leaving the route takes the fastest without asking.
    const first = current.path.length === 0;
    const ask = first && options.length > 1;
    // While the driver chooses, no traffic request yet: it's made for the route they pick.
    set({ options, computedAt: Date.now(), choosing: ask });
    applyChoice(0);
    if (ask) openChooser();
    else if (first) driveView(pos);
  } catch {
    // e.g. Routes API not allowed for this key: still show Google's route, in the free view.
    fallBack(destination, 'map.routeFallback');
  }
}

/** Draws route choice `i` as the route: line, pin, ETA; its traffic comes with the next Pro request. */
function applyChoice(i: number): void {
  const r = useMapUi.getState().route;
  const o = r?.options[i];
  if (!map || !libs || !r || !o) return;
  const keepChoosing = r.choosing;
  clearLine();
  casing = new libs.Polyline({ ...CASING_STYLE, path: o.path, map });
  line = new libs.Polyline({ ...LINE_STYLE, path: o.path, map });
  const pin = document.createElement('div');
  pin.className = 'jg-map-dest';
  destMarker = new libs.AdvancedMarkerElement({ map, position: o.path[o.path.length - 1], content: pin, title: r.destination });
  useMapUi.setState((s) =>
    s.route
      ? {
          route: {
            ...s.route,
            status: 'ready',
            chosen: i,
            path: o.path,
            distanceMeters: o.distanceMeters,
            durationMillis: o.durationMillis,
            description: o.description,
            traffic: null,
            computedAt: Date.now(),
          },
        }
      : s,
  );
  if (keepChoosing) drawAlts();
  else {
    void refreshTraffic();
    scheduleTraffic();
  }
}

/** The other choices, grey, under the chosen route. */
function drawAlts(): void {
  for (const l of altLines) l.setMap(null);
  const r = useMapUi.getState().route;
  if (!map || !libs || !r) return;
  altLines = r.options.filter((_, i) => i !== r.chosen).map((o) => new libs!.Polyline({ ...ALT_STYLE, path: o.path, map }));
}

function driveView(pos: Position | null): void {
  if (!map) return;
  useSettings.getState().setMapFollow(true);
  map.setZoom(DRIVE_ZOOM);
  if (pos) follow(pos, true);
}

/** Show the route choices: all of them on screen, north up, the others grey. Closes by itself after 30 s. */
export function openChooser(): void {
  const r = useMapUi.getState().route;
  if (!map || !libs || !r || r.options.length < 2) return;
  useMapUi.setState((s) => (s.route ? { route: { ...s.route, choosing: true } } : s));
  drawAlts();
  useSettings.getState().setMapFollow(false);
  northUp();
  const bounds = new libs.LatLngBounds();
  for (const o of r.options) for (const p of o.path) bounds.extend(p);
  map.fitBounds(bounds, routePadding());
  clearTimeout(chooserTimer);
  chooserTimer = window.setTimeout(() => chooseRoute(useMapUi.getState().route?.chosen ?? 0), 30_000);
}

/** Pick route choice `i` (or keep the current one) and drive: the others go, the car is followed. */
export function chooseRoute(i: number): void {
  const r = useMapUi.getState().route;
  if (!r) return;
  clearAlts();
  useMapUi.setState((s) => (s.route ? { route: { ...s.route, choosing: false } } : s));
  if (i !== r.chosen || !r.traffic) applyChoice(i);
  driveView(useGeo.getState().pos);
}

/**
 * "Show route": the route on the live map (position, traffic) with the Routes API — capped at 320 a day like map
 * loads. The free Embed directions view is used in mode B, when the route line is off in Settings, or as fallback.
 * Opening Google Maps for guidance is a separate button (route card).
 */
export function startRoute(destination: string): void {
  clearLine();
  const live = useMapUi.getState().mode === 'js' && useSettings.getState().map.routeLine;
  useMapUi.setState({
    route: {
      destination,
      status: live ? 'loading' : 'ready',
      path: [],
      distanceMeters: 0,
      durationMillis: 0,
      computedAt: 0,
      viaEmbed: !live,
      note: null,
      traffic: null,
      options: [],
      chosen: 0,
      choosing: false,
      description: '',
    },
  });
  if (live) void computeRoute(destination);
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
  return { hasMap: !!map, mode: useMapUi.getState().mode, lines: line ? 1 : 0, heading: camHeading, canRotate };
}
