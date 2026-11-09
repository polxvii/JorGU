import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { th } from '../../src/i18n/th';
import { translate } from '../../src/i18n/translate';

describe('i18n (§12.3)', () => {
  it('Thai has no keys that English lacks', () => {
    for (const k of Object.keys(th)) expect(k in en, k).toBe(true);
  });

  it('every English key has a Thai translation (report)', () => {
    const missing = Object.keys(en).filter((k) => !(k in th));
    // Missing keys fall back to English; this list should stay empty.
    expect(missing).toEqual([]);
  });

  it('falls back to English and interpolates params', () => {
    expect(translate('th', 'pane.change')).toBe('เปลี่ยน');
    expect(translate('en', 'picker.title', { side: 'left pane' })).toBe('Choose app for the left pane');
    expect(translate('th', 'picker.title', { side: 'จอซ้าย' })).toBe('เลือกแอปสำหรับจอซ้าย');
    expect(translate('en', 'settings.version', {})).toBe('Version {version}');
  });

  it('keeps placeholders consistent between languages', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [k, v] of Object.entries(th)) expect(vars(v!), k).toBe(vars(en[k as keyof typeof en]));
  });
});
