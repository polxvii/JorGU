// Simple stroke icons drawn for JorGu (24×24 grid).
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  swap: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  split: 'M3 5h18v14H3zM12 5v14',
  single: 'M3 5h18v14H3z',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  prev: 'M6 5v14M19 5 9 12l10 7z',
  next: 'M18 5v14M5 5l10 7-10 7z',
  play: 'M7 4.5v15L19.5 12z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  restore: 'M4 6h16v12H4zM9 3v3M15 3v3',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  youtube: 'M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9v6l5-3z',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  queue: 'M4 6h12M4 12h12M4 18h7M16 15v6l5-3z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  paste: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  shuffle: 'M3 7h4l10 10h4M17 21l4-4-4-4M3 17h4l3-3M14 10l3-3h4M17 3l4 4-4 4',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3',
  library: 'M4 5h4v14H4zM10 5h4v14h-4zM16.5 6.2l3.4-1 3 13.5-3.4.9z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  plus: 'M12 5v14M5 12h14',
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2',
  desktop: 'M3 4.5h18v11H3zM8.5 20h7M12 15.5V20',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  sort: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20a8 8 0 0 1 16 0',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  pin: 'M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7',
  target: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  traffic: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 6.5h.01M12 12h.01M12 17.5h.01',
  minus: 'M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  navigate: 'M3 11l18-8-8 18-2-8z',
  replay: 'M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
  muted: 'M4 9h4l5-4v14l-5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 28, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
