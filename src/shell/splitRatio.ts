// Divider rules (spec §6.1, §6.2, §3.9): 30–70 %, snap at 40/50/60 %, YouTube pane ≥ 356 px.
import type { PaneIndex } from '../features/settings/types';

export const SPLIT_MIN = 0.3;
export const SPLIT_MAX = 0.7;
export const SNAP_POINTS = [0.4, 0.5, 0.6] as const;
export const SNAP_DISTANCE = 0.025;
export const YT_MIN_WIDTH = 356;

export interface RatioBounds {
  min: number;
  max: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Clamp to the global 30–70 % range only (used when persisting). */
export function clampRatioLoose(r: number): number {
  return clamp(r, SPLIT_MIN, SPLIT_MAX);
}

/** Allowed ratio (pane 0 share) given the usable width and which pane, if any, holds YouTube. */
export function ratioBounds(usableWidth: number, youtubePane: PaneIndex | null): RatioBounds {
  let min = SPLIT_MIN;
  let max = SPLIT_MAX;
  if (usableWidth > 0) {
    if (youtubePane === 0) min = Math.max(min, YT_MIN_WIDTH / usableWidth);
    if (youtubePane === 1) max = Math.min(max, 1 - YT_MIN_WIDTH / usableWidth);
  }
  return { min, max };
}

export function splitFeasible(b: RatioBounds): boolean {
  return b.min <= b.max + 1e-9;
}

export function snapRatio(r: number): number {
  for (const p of SNAP_POINTS) if (Math.abs(r - p) <= SNAP_DISTANCE) return p;
  return r;
}

/** Snap first, then clamp into bounds (a snap point outside the bounds loses to the bound). */
export function resolveRatio(raw: number, b: RatioBounds): number {
  return clamp(snapRatio(raw), b.min, b.max);
}
