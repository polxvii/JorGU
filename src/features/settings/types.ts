// Settings shape (spec §13). Persisted in localStorage.
// Extension vs §13: web AppRefs carry a stable instance `id` so swapping two web panes never reloads them (M1 plan Q3).

export type AppKind = 'map' | 'youtube' | 'web';
export type WebInstanceId = 'w1' | 'w2';

export type AppRef =
  | { kind: 'map' }
  | { kind: 'youtube' }
  | { kind: 'web'; id: WebInstanceId; url: string };

/** What the App Picker can request. Web instances get their id assigned by the store. */
export type AppPick =
  | { kind: 'map' }
  | { kind: 'youtube' }
  | { kind: 'web'; url?: string };

export type PaneIndex = 0 | 1;
export type DriverSide = 'right' | 'left';
export type LayoutMode = 'single' | 'split';
export type ThemeId = 'carbon' | 'racing' | 'neon' | 'emerald' | 'amber' | 'stealth';
export type Language = 'en' | 'th';
export type MiniPlayerSize = '356x200' | '480x270';
/** Mini player corner: 'auto' = bottom corner on the driver side (user request 2026-11-11); t/b = top/bottom, l/r = left/right. */
export type MiniCorner = 'auto' | 'tl' | 'tr' | 'bl' | 'br';
/** Dock (right toolbar) size: button 64 / 80 / 96 px. */
export type DockSize = 'normal' | 'large' | 'xlarge';

export type WebViewMode =
  | { mode: 'auto'; zoom: 0.75 | 1 | 1.25 | 1.5 }
  | { mode: 'mobile' }
  | { mode: 'desktop' };

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  pinned: boolean;
  viewMode?: WebViewMode;
}

export interface SavedPlace {
  id: string;
  label: string;
  query: string;
  lat?: number;
  lng?: number;
  list?: string;
  source?: 'manual' | 'takeout';
}

/** How two panes share the screen: 'auto' = top/bottom on a portrait screen, side by side on a landscape one. */
export type SplitDirection = 'auto' | 'side' | 'stacked';

export interface LayoutSettings {
  mode: LayoutMode;
  direction: SplitDirection;
  /** Share of the usable width (height when stacked) given to pane 0, 0.30–0.70. */
  splitRatio: number;
  panes: [AppRef, AppRef];
  focusedPane: PaneIndex;
  fullscreenPane: PaneIndex | null;
  /** Pane 1 is always on the driver side; 'left' mirrors the whole layout. */
  driverSide: DriverSide;
}

export interface Settings {
  language: Language;
  themeId: ThemeId;
  nightMode: { auto: boolean; start: string; end: string };
  layout: LayoutSettings;
  map: {
    mode: 'js' | 'embed';
    /** Draw the route on the live map with the Routes API (capped at 320/day). Off: the free Embed directions view. */
    routeLine: boolean;
    follow: boolean;
    traffic: boolean;
    /** Route options (Routes API route modifiers; Embed `avoid`). Both stay in the Essentials route SKU. */
    avoidTolls: boolean;
    avoidHighways: boolean;
    savedPlaces: SavedPlace[];
    recentDestinations: string[];
  };
  web: {
    bookmarks: Bookmark[];
    recent: string[];
    viewModes: Record<string, WebViewMode>;
    desktopWidth: 1024 | 1280 | 1440;
  };
  youtube: {
    miniPlayerSize: MiniPlayerSize;
    miniCorner: MiniCorner;
    playbackRate: number;
    /** Tapping a video in a list keeps playing the rest of that list afterwards. */
    autoContinue: boolean;
  };
  dockSize: DockSize;
  library: { feedChannelLimit: number };
  playbackLoginCheck?: { testedAt: string; sawAds: boolean; browser: string };
}

export function defaultSettings(): Settings {
  return {
    language: 'en',
    themeId: 'carbon',
    nightMode: { auto: true, start: '18:30', end: '06:00' },
    layout: {
      mode: 'split',
      direction: 'auto',
      splitRatio: 0.5,
      panes: [{ kind: 'youtube' }, { kind: 'map' }],
      focusedPane: 1,
      fullscreenPane: null,
      driverSide: 'right',
    },
    map: { mode: 'js', routeLine: true, follow: true, traffic: true, avoidTolls: false, avoidHighways: false, savedPlaces: [], recentDestinations: [] },
    web: { bookmarks: [], recent: [], viewModes: {}, desktopWidth: 1280 },
    youtube: { miniPlayerSize: '356x200', miniCorner: 'auto', playbackRate: 1, autoContinue: true },
    dockSize: 'normal',
    library: { feedChannelLimit: 50 },
  };
}

export type SurfaceId = 'map' | 'youtube' | `web:${WebInstanceId}`;

export function surfaceIdOf(app: AppRef): SurfaceId {
  return app.kind === 'web' ? `web:${app.id}` : app.kind;
}
