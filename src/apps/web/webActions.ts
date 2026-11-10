// Pure reducers for Web app settings (spec §9.1, §9.7, §13). The settings store calls these; unit-tested.
import type { Bookmark, LayoutSettings, Settings, WebInstanceId, WebViewMode } from '../../features/settings/types';
import { hostLabel, originOf } from './normalizeUrl';

export const RECENT_MAX = 10;

type Web = Settings['web'];

export function withRecent(recent: string[], url: string): string[] {
  return [url, ...recent.filter((u) => u !== url)].slice(0, RECENT_MAX);
}

/** Point the pane holding web instance `id` at `url` ('' = the Web start page). */
export function setPaneUrl(layout: LayoutSettings, id: WebInstanceId, url: string): LayoutSettings {
  const i = layout.panes.findIndex((p) => p.kind === 'web' && p.id === id);
  if (i < 0) return layout;
  const panes: LayoutSettings['panes'] = [layout.panes[0], layout.panes[1]];
  panes[i] = { kind: 'web', id, url };
  return { ...layout, panes };
}

let seq = 0;
export function newBookmarkId(now = Date.now()): string {
  seq += 1;
  return `bm-${now.toString(36)}-${seq.toString(36)}`;
}

/** Adds a bookmark (once per URL); it starts with the view remembered for its origin. */
export function addBookmark(web: Web, url: string, title?: string): Web {
  if (web.bookmarks.some((b) => b.url === url)) return web;
  const viewMode = web.viewModes[originOf(url)];
  const b: Bookmark = { id: newBookmarkId(), title: (title ?? '').trim() || hostLabel(url), url, pinned: false, ...(viewMode ? { viewMode } : {}) };
  return { ...web, bookmarks: [...web.bookmarks, b] };
}

export function updateBookmark(web: Web, id: string, patch: Partial<Pick<Bookmark, 'title' | 'pinned'>>): Web {
  return {
    ...web,
    bookmarks: web.bookmarks.map((b) => {
      if (b.id !== id) return b;
      const title = patch.title === undefined ? b.title : patch.title.trim() || b.title;
      return { ...b, ...patch, title };
    }),
  };
}

export function removeBookmark(web: Web, id: string): Web {
  return { ...web, bookmarks: web.bookmarks.filter((b) => b.id !== id) };
}

/** Remember the view per origin (§9.7), and on the page's bookmark if it has one. */
export function setViewModeFor(web: Web, url: string, mode: WebViewMode): Web {
  const origin = originOf(url);
  return {
    ...web,
    viewModes: origin ? { ...web.viewModes, [origin]: mode } : web.viewModes,
    bookmarks: web.bookmarks.map((b) => (b.url === url ? { ...b, viewMode: mode } : b)),
  };
}
