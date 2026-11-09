import { describe, expect, it } from 'vitest';
import { mergeSettings } from '../../src/features/settings/merge';
import { defaultSettings } from '../../src/features/settings/types';

describe('mergeSettings', () => {
  it('keeps new default fields when persisted data is older', () => {
    const persisted = { language: 'th', layout: { driverSide: 'left' }, youtube: {} };
    const m = mergeSettings(persisted, defaultSettings());
    expect(m.language).toBe('th');
    expect(m.layout.driverSide).toBe('left');
    expect(m.layout.panes).toEqual(defaultSettings().layout.panes);
    expect(m.youtube.miniPlayerSize).toBe('356x200');
    expect(m.alerts.cooldownSec).toBe(30);
  });

  it('ignores garbage', () => {
    expect(mergeSettings('nope', defaultSettings())).toEqual(defaultSettings());
    expect(mergeSettings({ language: 'fr' }, defaultSettings()).language).toBe('en');
  });
});
