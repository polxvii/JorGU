import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
}

function readSafeArea(): Viewport['safeArea'] {
  const el = document.getElementById('jg-safe-area');
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(el);
  const n = (v: string) => Math.round(parseFloat(v) || 0);
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}

function read(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight, safeArea: readSafeArea() };
}

function same(a: Viewport, b: Viewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.safeArea.top === b.safeArea.top &&
    a.safeArea.right === b.safeArea.right &&
    a.safeArea.bottom === b.safeArea.bottom &&
    a.safeArea.left === b.safeArea.left
  );
}

/** Window size and safe-area insets, updated on resize/orientation change. */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVp((prev) => (same(prev, read()) ? prev : read())));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return vp;
}
