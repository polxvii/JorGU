// Control sizes for the current Toolbar size setting (same table the layout engine uses).
import { useSettings } from '../features/settings/settingsStore';
import { CONTROL_SIZES } from './computeLayout';

export function useControlSize() {
  return CONTROL_SIZES[useSettings((s) => s.dockSize)];
}
