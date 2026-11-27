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
    expect(m.web.desktopWidth).toBe(1280);
    expect(m.youtube.hideUpTo).toBe(120);
  });

  it('short-clip length: only 1 / 2 / 3 min', () => {
    expect(mergeSettings({ youtube: { hideUpTo: 180 } }, defaultSettings()).youtube.hideUpTo).toBe(180);
    expect(mergeSettings({ youtube: { hideUpTo: 45 } }, defaultSettings()).youtube.hideUpTo).toBe(120);
  });

  it('mini player spot and car shift (user 2026-11-27): kept when sane, else reset', () => {
    expect(mergeSettings({ youtube: { miniAt: { x: 0.25, y: 1 } } }, defaultSettings()).youtube.miniAt).toEqual({ x: 0.25, y: 1 });
    expect(mergeSettings({ youtube: { miniAt: { x: 2, y: 0 } } }, defaultSettings()).youtube.miniAt).toBeNull();
    expect(mergeSettings({ youtube: { miniAt: 'tl' } }, defaultSettings()).youtube.miniAt).toBeNull();
    expect(mergeSettings({}, defaultSettings()).youtube.miniAt).toBeNull();
    expect(mergeSettings({ map: { carShift: { x: -0.3, y: 0.1 } } }, defaultSettings()).map.carShift).toEqual({ x: -0.3, y: 0.1 });
    expect(mergeSettings({ map: { carShift: { x: 0.9, y: 0 } } }, defaultSettings()).map.carShift).toEqual({ x: 0, y: 0 });
    expect(mergeSettings({ map: { carShift: null } }, defaultSettings()).map.carShift).toEqual({ x: 0, y: 0 });
  });

  it('ignores garbage', () => {
    expect(mergeSettings('nope', defaultSettings())).toEqual(defaultSettings());
    expect(mergeSettings({ language: 'fr' }, defaultSettings()).language).toBe('en');
  });
});
