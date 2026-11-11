import { sanitizeLayout } from '../../shell/layoutActions';
import type { Settings } from './types';

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
  if (!['normal', 'large', 'xlarge'].includes(merged.dockSize)) merged.dockSize = 'normal';
  if (typeof merged.youtube.autoContinue !== 'boolean') merged.youtube.autoContinue = true;
  if (typeof merged.map.routeLine !== 'boolean') merged.map.routeLine = false;
  if (merged.map.mode !== 'js' && merged.map.mode !== 'embed') merged.map.mode = 'js';
  return merged;
}

