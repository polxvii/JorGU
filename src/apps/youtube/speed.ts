// Playback speed presets (user request, spec §8.5). Only rates the current video supports are offered.
export const SPEED_PRESETS = [1, 1.5, 2] as const;

const close = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Next preset after `current`, limited to `available` (live streams usually offer only 1). */
export function nextSpeed(current: number, available: readonly number[]): number {
  const options = SPEED_PRESETS.filter((r) => available.length === 0 || available.some((a) => close(a, r)));
  if (options.length === 0) return 1;
  const i = options.findIndex((r) => close(r, current));
  return options[(i + 1) % options.length];
}

/** The rate to apply to a newly loaded video: the saved rate if supported, else the closest lower supported one. */
export function applicableRate(saved: number, available: readonly number[]): number {
  if (available.length === 0) return saved;
  if (available.some((a) => close(a, saved))) return saved;
  const lower = available.filter((a) => a <= saved).sort((x, y) => y - x);
  return lower[0] ?? 1;
}

export function formatSpeed(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toString().replace(/0+$/, '')}×`;
}
