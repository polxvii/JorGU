// Counts iframe loads per surface (the parent sees `load` even for cross-origin frames). E2E tests read
// window.__jorguFrameLoads to prove that swapping, resizing, and full screen never reload an iframe (spec §6.3).
declare global {
  interface Window {
    __jorguFrameLoads?: Record<string, number>;
  }
}

export function installFrameLoadCounter(): void {
  window.__jorguFrameLoads = {};
}

export function countFrameLoad(name: string): void {
  const counts = window.__jorguFrameLoads;
  if (counts) counts[name] = (counts[name] ?? 0) + 1;
}
