// Back / Forward for Web panes (user 2026-11-13). A page can't read or drive a cross-origin iframe's history, but
// the browser keeps one joint history for the page and all its frames, so history.back() / forward() from JorGu
// steps the frame that navigated last. JorGu tracks which frame that is from the frames' load events:
// - a load we didn't cause = a new page in that frame (one step back becomes possible there);
// - our own Reload and the map's Embed view navigate with location.replace(), which adds no step;
// - Back / Forward are offered only for the frame whose step is on top, so they never move another frame.
// If a step was miscounted (a site that replaces its own page), Back could run past the frames into JorGu's own
// history: a guard entry (pushed on the first tap) takes that step instead of leaving JorGu.
import { create } from 'zustand';
import type { WebInstanceId } from '../../features/settings/types';

interface WebHistory {
  /** Frames with a step to go back to, oldest first (one entry per step). */
  back: WebInstanceId[];
  forward: WebInstanceId[];
}

export const useWebHistory = create<WebHistory>(() => ({ back: [], forward: [] }));

const traversing = new Map<WebInstanceId, number>();
const ownLoads = new Map<WebInstanceId, number>();
let lastTraverse = 0;
const GUARD = 'jorguWebGuard';

export const canGoBack = (s: WebHistory, id: WebInstanceId) => s.back[s.back.length - 1] === id;
export const canGoForward = (s: WebHistory, id: WebInstanceId) => s.forward[s.forward.length - 1] === id;

const bump = (m: Map<WebInstanceId, number>, id: WebInstanceId, by: number) => m.set(id, Math.max(0, (m.get(id) ?? 0) + by));

/** A frame finished loading. `first` = the page it was created with. */
export function frameLoaded(id: WebInstanceId, first: boolean): void {
  if (first) return;
  if (ownLoads.get(id)) return void bump(ownLoads, id, -1);
  if (traversing.get(id)) return void bump(traversing, id, -1);
  useWebHistory.setState((s) => ({ back: [...s.back, id], forward: [] }));
}

/** The frame is gone (new URL, pane closed): its steps went with it. */
export function frameGone(id: WebInstanceId): void {
  traversing.delete(id);
  ownLoads.delete(id);
  useWebHistory.setState((s) => ({ back: s.back.filter((x) => x !== id), forward: s.forward.filter((x) => x !== id) }));
}

function traverse(id: WebInstanceId, dir: -1 | 1): void {
  bump(traversing, id, 1);
  lastTraverse = Date.now();
  // A same-page step (a site's own in-page history) fires no load: don't let the count swallow a later page.
  setTimeout(() => bump(traversing, id, -1), 4000);
  if (dir < 0) history.back();
  else history.forward();
}

// Always usable (user 2026-11-13: they stayed grey on sites that change page without loading one, which our count
// can't see; the browser's history still has those steps). With nothing to go back to, the guard entry takes the
// step and nothing changes; with nothing ahead, Forward does nothing. One step at a time, so a double tap can't run
// past the guard.
let lockUntil = 0;
const locked = () => {
  if (Date.now() < lockUntil) return true;
  lockUntil = Date.now() + 700;
  return false;
};

/** True just after our own Back / Forward: the full-screen Back handling leaves those steps alone. */
export const webTraversing = () => Date.now() - lastTraverse < 1500;

export function goBack(id: WebInstanceId): void {
  if (locked()) return;
  if (canGoBack(useWebHistory.getState(), id)) useWebHistory.setState((s) => ({ back: s.back.slice(0, -1), forward: [...s.forward, id] }));
  traverse(id, -1);
}

export function goForward(id: WebInstanceId): void {
  if (locked()) return;
  if (canGoForward(useWebHistory.getState(), id)) useWebHistory.setState((s) => ({ forward: s.forward.slice(0, -1), back: [...s.back, id] }));
  traverse(id, 1);
}

/** Navigate a frame without adding a history step (Reload, the map's Embed view). */
export function navigateInPlace(frame: HTMLIFrameElement | null, url: string, id?: WebInstanceId): void {
  if (!frame) return;
  if (id) bump(ownLoads, id, 1);
  try {
    frame.contentWindow!.location.replace(url);
  } catch {
    frame.src = url;
  }
}

let installed = false;
/**
 * When a Web page first shows, before its frame can add any step: the guard entry, and its catch. (Pushed later, it
 * would land between the frame's steps and Back would have to cross it.)
 */
export function installWebHistoryGuard(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const push = () => {
    if (!(history.state && history.state[GUARD])) history.pushState({ [GUARD]: true }, '');
  };
  push();
  window.addEventListener('popstate', () => {
    // Our own Back went past the frames' steps: stay in JorGu, forget the miscounted steps.
    if (Date.now() - lastTraverse < 3000 && !(history.state && history.state[GUARD])) {
      useWebHistory.setState({ back: [], forward: [] });
      push();
    }
  });
}
