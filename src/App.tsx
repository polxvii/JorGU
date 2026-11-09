import { ChromeLayer } from './shell/ChromeLayer';
import { SurfaceLayer } from './shell/SurfaceLayer';
import { useFullscreenController } from './shell/fullscreen';
import { useAppEffects } from './shell/useAppEffects';
import { useLayout } from './shell/useLayout';

export function App() {
  const layout = useLayout();
  useAppEffects(layout);
  useFullscreenController();
  return (
    <div
      id="jorgu-root"
      className="fixed inset-0 overflow-hidden bg-bg text-text"
      data-mode={layout.mode}
      data-driver={layout.driverSide}
      data-yt={layout.youtube.mode}
    >
      <div id="jg-safe-area" aria-hidden="true" />
      <SurfaceLayer layout={layout} />
      <ChromeLayer layout={layout} />
    </div>
  );
}
