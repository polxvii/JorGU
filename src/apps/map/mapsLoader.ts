// Loads the Maps JavaScript API once (spec §7.1) with Google's documented script URL (loading=async + callback),
// then libraries via google.maps.importLibrary. Authentication failures (bad key, referrer not allowed, billing off)
// arrive through the documented global `gm_authFailure` hook.
import { MAPS_KEY } from './config';

/* Minimal typings for the parts JorGu uses. */
export interface LatLngLiteral {
  lat: number;
  lng: number;
}
export interface GMap {
  setCenter(c: LatLngLiteral): void;
  panTo(c: LatLngLiteral): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
  addListener(event: string, fn: () => void): { remove(): void };
  fitBounds(bounds: unknown, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
}
export interface GMarker {
  position: LatLngLiteral | null;
  map: GMap | null;
  content?: HTMLElement;
}
export interface GLayer {
  setMap(map: GMap | null): void;
}
export interface GPolyline {
  setMap(map: GMap | null): void;
}
export interface GRoute {
  durationMillis?: number;
  distanceMeters?: number;
  path?: { lat: number | (() => number); lng: number | (() => number) }[];
  createPolylines(options?: unknown): GPolyline[];
}
export interface MapsLibs {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap;
  AdvancedMarkerElement: new (options: Record<string, unknown>) => GMarker;
  TrafficLayer: new () => GLayer;
  Route: { computeRoutes(request: Record<string, unknown>): Promise<{ routes?: GRoute[] }> };
  LatLngBounds: new () => { extend(p: LatLngLiteral): void };
  ColorScheme: Record<'LIGHT' | 'DARK', unknown>;
}

interface GoogleNs {
  maps: { importLibrary(name: string): Promise<Record<string, unknown>> };
}
type W = Window & { google?: GoogleNs; __jorguMapsReady?: () => void; gm_authFailure?: () => void };

let loading: Promise<MapsLibs> | null = null;
const authListeners = new Set<() => void>();

/** Called when Google rejects the key (wrong referrer, API not enabled, billing off, quota). */
export function onMapsAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadMaps(language: string): Promise<MapsLibs> {
  if (loading) return loading;
  const w = window as W;
  w.gm_authFailure = () => authListeners.forEach((fn) => fn());
  loading = new Promise<void>((resolve, reject) => {
    w.__jorguMapsReady = () => resolve();
    const s = document.createElement('script');
    const q = new URLSearchParams({
      key: MAPS_KEY,
      v: 'weekly',
      loading: 'async',
      callback: '__jorguMapsReady',
      language: language === 'th' ? 'th' : 'en',
      region: 'TH',
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    s.async = true;
    s.onerror = () => reject(new Error('maps script failed to load'));
    document.head.appendChild(s);
  }).then(async () => {
    const g = w.google!.maps;
    const [maps, marker, routes, core] = await Promise.all([
      g.importLibrary('maps'),
      g.importLibrary('marker'),
      g.importLibrary('routes'),
      g.importLibrary('core'),
    ]);
    return {
      Map: maps.Map,
      TrafficLayer: maps.TrafficLayer,
      AdvancedMarkerElement: marker.AdvancedMarkerElement,
      Route: routes.Route,
      LatLngBounds: core.LatLngBounds,
      ColorScheme: core.ColorScheme,
    } as unknown as MapsLibs;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
