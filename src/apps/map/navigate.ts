// Navigation handoff (spec §7.3): Google Maps does the guidance. Maps URLs need no API key and cost nothing.
// https://developers.google.com/maps/documentation/urls/get-started · iOS scheme: .../urls/ios-urlscheme

/** Universal link: opens the Google Maps app when it's installed (in-app browsers: [Verify] on CarTV). */
export function mapsNavigateUrl(destination: string): string {
  const q = new URLSearchParams({ api: '1', destination: destination.trim(), travelmode: 'driving', dir_action: 'navigate' });
  return `https://www.google.com/maps/dir/?${q}`;
}

/** iOS Google Maps app URL scheme, for hosts that don't hand universal links to apps. */
export function mapsAppSchemeUrl(destination: string): string {
  const q = new URLSearchParams({ daddr: destination.trim(), directionsmode: 'driving' });
  return `comgooglemaps://?${q}`;
}

export const RECENT_DESTINATIONS_MAX = 10;

export function withRecentDestination(list: string[], destination: string): string[] {
  const d = destination.trim();
  if (!d) return list;
  return [d, ...list.filter((x) => x.toLowerCase() !== d.toLowerCase())].slice(0, RECENT_DESTINATIONS_MAX);
}
