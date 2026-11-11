import { describe, expect, it } from 'vitest';
import { defaultSettings, type LayoutSettings } from '../../src/features/settings/types';
import {
  assignApp, enterFullscreen, exitFullscreen, sanitizeLayout, swapPanes, switchFullscreen, toggleLayoutMode,
} from '../../src/shell/layoutActions';

const base = (): LayoutSettings => defaultSettings().layout;

describe('assignApp', () => {
  it('replaces a non-singleton pane', () => {
    const l = assignApp(base(), 1, { kind: 'web', url: 'https://a.example/' });
    expect(l.panes).toEqual([{ kind: 'youtube' }, { kind: 'web', id: 'w1', url: 'https://a.example/' }]);
  });

  it('a saved Dashboard pane (app removed) becomes Map, or YouTube when Map is taken', () => {
    const fb = base();
    const fix = (panes: unknown[]) => sanitizeLayout({ ...fb, panes } as never, fb).panes;
    expect(fix([{ kind: 'dashboard' }, { kind: 'youtube' }])).toEqual([{ kind: 'map' }, { kind: 'youtube' }]);
    expect(fix([{ kind: 'map' }, { kind: 'dashboard' }])).toEqual([{ kind: 'map' }, { kind: 'youtube' }]);
    expect(fix([{ kind: 'dashboard' }, { kind: 'dashboard' }])).toEqual([{ kind: 'map' }, { kind: 'youtube' }]);
    expect(fix([{ kind: 'web', id: 'w2', url: 'https://a.example/' }, { kind: 'dashboard' }])).toEqual([
      { kind: 'web', id: 'w2', url: 'https://a.example/' },
      { kind: 'map' },
    ]);
  });

  it('swaps when the singleton is already in the other pane (§6.1)', () => {
    const l = assignApp(base(), 1, { kind: 'youtube' });
    expect(l.panes).toEqual([{ kind: 'map' }, { kind: 'youtube' }]);
  });

  it('is a no-op when the app is already in that pane', () => {
    const b = base();
    expect(assignApp(b, 0, { kind: 'youtube' })).toBe(b);
  });

  it('gives each web pane its own instance id', () => {
    let l = assignApp(base(), 0, { kind: 'web', url: 'https://a.example' });
    l = assignApp(l, 1, { kind: 'web', url: 'https://b.example' });
    const [a, b] = l.panes;
    expect(a.kind === 'web' && b.kind === 'web' && a.id !== b.id).toBe(true);
  });

  it('keeps the web instance id and previous URL when re-picking Web in the same pane', () => {
    const l1 = assignApp(base(), 1, { kind: 'web', url: 'https://a.example' });
    const l2 = assignApp(l1, 1, { kind: 'web' });
    expect(l2.panes[1]).toEqual(l1.panes[1]);
  });

  it('swapping two web panes keeps their ids with their URLs', () => {
    let l = assignApp(base(), 0, { kind: 'web', url: 'https://a.example' });
    l = assignApp(l, 1, { kind: 'web', url: 'https://b.example' });
    const s = swapPanes(l);
    expect(s.panes[0]).toEqual(l.panes[1]);
    expect(s.panes[1]).toEqual(l.panes[0]);
  });
});

describe('full screen reducers', () => {
  it('enter / switch / exit', () => {
    let l = enterFullscreen(base(), 1);
    expect(l.fullscreenPane).toBe(1);
    expect(l.focusedPane).toBe(1);
    l = switchFullscreen(l);
    expect(l.fullscreenPane).toBe(0);
    l = exitFullscreen(l);
    expect(l.fullscreenPane).toBeNull();
  });

  it('switch does nothing outside full screen', () => {
    const b = base();
    expect(switchFullscreen(b)).toBe(b);
  });

  it('toggles single/split', () => {
    expect(toggleLayoutMode(base()).mode).toBe('single');
    expect(toggleLayoutMode(toggleLayoutMode(base())).mode).toBe('split');
  });
});

describe('sanitizeLayout', () => {
  it('repairs duplicate singletons and bad values', () => {
    const l = sanitizeLayout(
      { panes: [{ kind: 'map' }, { kind: 'map' }], splitRatio: 5, focusedPane: 7 as never, fullscreenPane: 3 as never },
      base(),
    );
    expect(l.panes).toEqual(base().panes);
    expect(l.splitRatio).toBe(0.7);
    expect(l.focusedPane).toBe(base().focusedPane);
    expect(l.fullscreenPane).toBeNull();
  });

  it('repairs duplicate web ids', () => {
    const l = sanitizeLayout(
      { panes: [{ kind: 'web', id: 'w1', url: 'a' }, { kind: 'web', id: 'w1', url: 'b' }] },
      base(),
    );
    const [a, b] = l.panes;
    expect(a.kind === 'web' && b.kind === 'web' && a.id !== b.id).toBe(true);
  });

  it('drops unknown app kinds', () => {
    const l = sanitizeLayout({ panes: [{ kind: 'tv' } as never, { kind: 'map' }] }, base());
    expect(l.panes).toEqual(base().panes);
  });
});
