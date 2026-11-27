import { sanitizeLayout } from '../../shell/layoutActions';
import { CONTINUE_WITH, HIDE_UP_TO, type Settings } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export { isPlainObject };

/** Deep-merge persisted values over defaults (arrays replace), then repair the layout. */
export function mergeSettings(persisted: unknown, current: Settings): Settings {
  const merge = (base: unknown, over: unknown): unknown => {
    if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
    return out;
  };
  const merged = merge(current, isPlainObject(persisted) ? persisted : {}) as Settings;
  merged.layout = sanitizeLayout(merged.layout, current.layout);
  if (merged.language !== 'en' && merged.language !== 'th') merged.language = 'en';
  if (!['auto', 'tl', 'tr', 'bl', 'br'].includes(merged.youtube.miniCorner)) merged.youtube.miniCorner = 'auto';
  const within = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const at = merged.youtube.miniAt as unknown;
  if (!(isPlainObject(at) && within(at.x, 0, 1) && within(at.y, 0, 1))) merged.youtube.miniAt = null;
  if (!within(merged.youtube.miniWidth, 356, 4000)) merged.youtube.miniWidth = null;
  const shift = merged.map.carShift as unknown;
  if (!(isPlainObject(shift) && within(shift.x, -0.4, 0.4) && within(shift.y, -0.4, 0.4))) merged.map.carShift = { x: 0, y: 0 };
  if (!['normal', 'large', 'xlarge'].includes(merged.dockSize)) merged.dockSize = 'normal';
  // Before 2026-11-15: autoContinue on/off (off stays off). 'mix' (2026-11-15 to 2026-11-16) becomes 'list'.
  const yt = merged.youtube as Settings['youtube'] & { autoContinue?: unknown };
  if (!(CONTINUE_WITH as readonly string[]).includes(yt.continueWith)) yt.continueWith = 'list';
  if (yt.autoContinue === false && !(isPlainObject(persisted) && isPlainObject(persisted.youtube) && 'continueWith' in persisted.youtube)) yt.continueWith = 'off';
  delete yt.autoContinue;
  if (typeof merged.youtube.hidePlayed !== 'boolean') merged.youtube.hidePlayed = true;
  if (!(HIDE_UP_TO as readonly number[]).includes(merged.youtube.hideUpTo)) merged.youtube.hideUpTo = 120;
  if (typeof merged.map.routeLine !== 'boolean') merged.map.routeLine = true;
  if (typeof merged.map.avoidTolls !== 'boolean') merged.map.avoidTolls = false;
  if (typeof merged.map.avoidHighways !== 'boolean') merged.map.avoidHighways = false;
  if (merged.map.routeInfoAt !== 'top' && merged.map.routeInfoAt !== 'bottom') merged.map.routeInfoAt = 'bottom';
  if (!['day', 'auto', 'night'].includes(merged.map.colors)) merged.map.colors = 'day';
  if (merged.map.mode !== 'js' && merged.map.mode !== 'embed') merged.map.mode = 'js';
  if (merged.web.search !== 'google' && merged.web.search !== 'bing') merged.web.search = 'google';
  return merged;
}

