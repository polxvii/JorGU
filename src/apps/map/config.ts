// Google Maps Platform settings from the build (spec §18): VITE_GOOGLE_MAPS_API_KEY (HTTP-referrer restricted) and
// VITE_GOOGLE_MAP_ID (needed for Advanced Markers). Locally in .env.local, in production as Workers Builds variables.
export const MAPS_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
/** Google's documented test Map ID when none is configured (Advanced Markers need one). */
export const MAP_ID: string = (import.meta.env.VITE_GOOGLE_MAP_ID ?? '').trim() || 'DEMO_MAP_ID';
export const mapsConfigured = (): boolean => MAPS_KEY.length > 0;

/** Bangkok, until the device reports a position. */
export const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 };
