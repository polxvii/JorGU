// The one Google map of the app (spec §7.1, §6.3): created once per page load (each `new Map` is a billed load),
// inside a container that is never re-parented. Mode B (Embed) takes over when the cost rule says so (§7.1).
import { create } from 'zustand';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import type { MessageKey } from '../../i18n';
import { DEFAULT_CENTER, MAP_ID, mapsConfigured } from './config';
import { type Position, useGeo } from './geo';
import { type GMap, type GMarker, type GLayer, type GPolyline, type MapsLibs, loadMaps, onMapsAuthFailure } from './mapsLoader';
import { RECOMPUTE_MIN_MS, type LL, progress } from './routeMath';
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
let polylines: GPolyline[] = [];
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
    if (markerDot) markerDot.style.setProperty('--jg-heading', `${pos.heading ?? 0}deg`);
    if (useSettings.getState().map.follow) map.panTo(here);
  }
  // A route waiting for the first position starts now.
  const r = useMapUi.getState().route;
  if (r?.status === 'needsLocation') void computeRoute(r.destination);
  checkRoute(pos);
}

// ---------- controls ----------

export function recenter(): void {
  useSettings.getState().setMapFollow(true);
  const pos = useGeo.getState().pos;
  if (!pos) useGeo.getState().retry();
  if (map && pos) map.panTo({ lat: pos.lat, lng: pos.lng });
  const ui = useMapUi.getState();
  if (ui.mode === 'embed' || ui.route?.viaEmbed) useMapUi.setState((s) => ({ embedNonce: s.embedNonce + 1 }));
}

export function zoomBy(step: number): void {
  if (map) map.setZoom((map.getZoom() ?? 15) + step);
}

export function setTraffic(on: boolean): void {
  useSettings.getState().setMapTraffic(on);
  traffic?.setMap(on ? map : null);
}

// ---------- route overview (§7.4): line, ETA, distance left; no turn instructions ----------

const num = (v: number | (() => number)) => (typeof v === 'function' ? v() : v);

function clearLine(): void {
  for (const p of polylines) p.setMap(null);
  polylines = [];
  if (destMarker) destMarker.map = null;
  destMarker = null;
}

/** Room around the route overview so the route card and the control column don't cover its ends. */
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
    });
    const r = routes?.[0];
    if (!r || !r.path?.length) return fallBack(destination, 'map.routeFallback');
    const current = useMapUi.getState().route;
    if (current?.destination !== destination) return;
    // First drawing: show the whole route (the moving dot stays on it; ⌖ goes back to following the car).
    // A recompute after leaving the route keeps the view the driver has.
    const first = current.path.length === 0;
    clearLine();
    polylines = r.createPolylines();
    for (const p of polylines) p.setMap(map);
    const path = r.path.map((p) => ({ lat: num(p.lat), lng: num(p.lng) }));
    const pin = document.createElement('div');
    pin.className = 'jg-map-dest';
    destMarker = new libs.AdvancedMarkerElement({ map, position: path[path.length - 1], content: pin, title: destination });
    if (first) {
      useSettings.getState().setMapFollow(false);
      const bounds = new libs.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.fitBounds(bounds, routePadding());
    }
    set({ status: 'ready', path, distanceMeters: r.distanceMeters ?? 0, durationMillis: r.durationMillis ?? 0, computedAt: Date.now() });
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
});

/** Read-only hook for E2E tests. */
export function debugMap() {
  return { hasMap: !!map, mode: useMapUi.getState().mode, lines: polylines.length };
}
