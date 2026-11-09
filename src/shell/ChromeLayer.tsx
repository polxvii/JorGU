import { useUi } from '../features/settings/uiStore';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { AppPicker } from './AppPicker';
import { Banners } from './Banners';
import type { LayoutResult } from './computeLayout';
import { Divider } from './Divider';
import { Dock } from './Dock';
import { ControlColumn, EdgeStrip, FloatingControls, MiniHandle } from './FullscreenChrome';
import { PaneChrome } from './PaneChrome';

export function ChromeLayer({ layout }: { layout: LayoutResult }) {
  const sheet = useUi((s) => s.sheet);
  return (
    <div className="pointer-events-none absolute inset-0 *:pointer-events-auto" data-layer="chrome">
      {layout.banner && <Banners rect={layout.banner} />}
      {layout.dock && <Dock rect={layout.dock} />}
      <PaneChrome layout={layout} />
      <Divider layout={layout} />
      {layout.edgeStrip && <EdgeStrip rect={layout.edgeStrip} />}
      <FloatingControls layout={layout} />
      {layout.controlColumn && <ControlColumn rect={layout.controlColumn} />}
      {layout.mini && <MiniHandle rect={layout.mini.handle} />}
      {sheet && layout.sheet && sheet.kind === 'picker' && <AppPicker rect={layout.sheet} pane={sheet.pane} layout={layout} />}
      {sheet && layout.sheet && sheet.kind === 'settings' && <SettingsSheet rect={layout.sheet} />}
    </div>
  );
}
