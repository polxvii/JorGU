// Counts loads of /dev/frame-probe.html iframes. E2E tests read window.__jorguFrameLoads to prove that swapping,
// resizing, and full screen never reload an iframe (spec §6.3). Removed once real apps replace the placeholders.
declare global {
  interface Window {
    __jorguFrameLoads?: Record<string, number>;
  }
}

export function installFrameLoadCounter(): void {
  const counts: Record<string, number> = {};
  window.__jorguFrameLoads = counts;
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== location.origin) return;
    const d = e.data as { type?: unknown; name?: unknown } | null;
    if (d && d.type === 'jorgu-frame-load' && typeof d.name === 'string') counts[d.name] = (counts[d.name] ?? 0) + 1;
  });
}
