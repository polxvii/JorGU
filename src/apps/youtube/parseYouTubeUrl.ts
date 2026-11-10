// Parses every YouTube link form in spec §8.3 into a video and/or playlist id. No network, no quota.
export interface ParsedYouTube {
  videoId?: string;
  playlistId?: string;
  /** Start position in seconds from t= / start= */
  start?: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

function parseStart(v: string | null): number | undefined {
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || !m[0]) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYouTubeUrl(input: string): ParsedYouTube | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return { videoId: raw };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const out: ParsedYouTube = {};
  const segments = url.pathname.split('/').filter(Boolean);
  if (host.endsWith('youtu.be')) {
    if (segments[0] && VIDEO_ID.test(segments[0])) out.videoId = segments[0];
  } else if (segments[0] === 'watch') {
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) out.videoId = v;
  } else if (['shorts', 'live', 'embed', 'v', 'e'].includes(segments[0] ?? '')) {
    if (segments[1] && VIDEO_ID.test(segments[1])) out.videoId = segments[1];
  }
  const list = url.searchParams.get('list');
  if (list && PLAYLIST_ID.test(list)) out.playlistId = list;
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (start !== undefined && out.videoId) out.start = start;

  return out.videoId || out.playlistId ? out : null;
}
