import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/theme/contrast';
import { THEMES, THEME_IDS, isNightTime, nightTokens } from '../../src/theme/themes';

describe('themes pass WCAG AA (§12.2)', () => {
  for (const id of THEME_IDS) {
    for (const night of [false, true]) {
      it(`${id}${night ? ' (night)' : ''}`, () => {
        const t = night ? nightTokens(THEMES[id]) : THEMES[id];
        // Body text 4.5:1 on both backgrounds
        for (const bg of [t.bg, t.surface]) {
          expect(contrastRatio(t.text, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t.textDim, bg)).toBeGreaterThanOrEqual(4.5);
        }
        // Text on accent buttons
        expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
        // Non-text UI (icons, borders, status colours) 3:1
        for (const c of [t.accent, t.warn, t.danger]) {
          expect(contrastRatio(c, t.bg)).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(c, t.surface)).toBeGreaterThanOrEqual(3);
        }
        // Banner/danger text uses bg on warn/danger fills
        expect(contrastRatio(t.bg, t.warn)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.bg, t.danger)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('isNightTime', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m);
  it('handles ranges across midnight', () => {
    expect(isNightTime(at(19), '18:30', '06:00')).toBe(true);
    expect(isNightTime(at(3), '18:30', '06:00')).toBe(true);
    expect(isNightTime(at(12), '18:30', '06:00')).toBe(false);
    expect(isNightTime(at(18, 29), '18:30', '06:00')).toBe(false);
  });
  it('handles same-day ranges and bad input', () => {
    expect(isNightTime(at(10), '09:00', '17:00')).toBe(true);
    expect(isNightTime(at(10), 'x', '17:00')).toBe(false);
  });
});
