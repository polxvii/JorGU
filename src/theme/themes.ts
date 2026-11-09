// Six original HUD palettes (spec §12.2). Names follow the feature list; colours are our own.
// Every theme (and its night variant) is unit-tested for WCAG AA contrast.
import type { ThemeId } from '../features/settings/types';
import { mix } from './contrast';

export interface ThemeTokens {
  bg: string;
  surface: string;
  text: string;
  textDim: string;
  accent: string;
  /** Text/icon colour on an accent-filled button. */
  onAccent: string;
  warn: string;
  danger: string;
}

export const THEME_IDS: ThemeId[] = ['carbon', 'racing', 'neon', 'emerald', 'amber', 'stealth'];

export const THEMES: Record<ThemeId, ThemeTokens> = {
  carbon: {
    bg: '#0d0f12', surface: '#191d23', text: '#eef2f6', textDim: '#a3adb8',
    accent: '#4da3ff', onAccent: '#06121f', warn: '#ffb020', danger: '#ff6166',
  },
  racing: {
    bg: '#0a0d18', surface: '#151b2e', text: '#f2f4fa', textDim: '#a9b1c8',
    accent: '#6a96ff', onAccent: '#050a18', warn: '#ffc247', danger: '#ff6b5e',
  },
  neon: {
    bg: '#0b0716', surface: '#191130', text: '#f5f0ff', textDim: '#b9acd8',
    accent: '#ff4fd0', onAccent: '#1a0014', warn: '#ffe04a', danger: '#ff5c7f',
  },
  emerald: {
    bg: '#06110d', surface: '#10211a', text: '#e9f7f0', textDim: '#9cc0b0',
    accent: '#2fd38a', onAccent: '#03140c', warn: '#f5c542', danger: '#ff6b6b',
  },
  amber: {
    bg: '#0f0b05', surface: '#1e170b', text: '#ffe9c2', textDim: '#cfae78',
    accent: '#ffb000', onAccent: '#1a1000', warn: '#ff8a3d', danger: '#ff6252',
  },
  stealth: {
    bg: '#000000', surface: '#141414', text: '#e6e6e6', textDim: '#a0a0a0',
    accent: '#d6d6d6', onAccent: '#000000', warn: '#e6b84a', danger: '#ff6464',
  },
};

/** Night variant: text and accents pulled 12 % toward the background (less glare). */
export function nightTokens(t: ThemeTokens): ThemeTokens {
  const k = 0.12;
  return { ...t, text: mix(t.text, t.bg, k), textDim: mix(t.textDim, t.bg, k), accent: mix(t.accent, t.bg, k) };
}

export function tokensFor(id: ThemeId, night: boolean): ThemeTokens {
  const t = THEMES[id] ?? THEMES.carbon;
  return night ? nightTokens(t) : t;
}

export function applyTheme(id: ThemeId, night: boolean, root: HTMLElement = document.documentElement): void {
  const t = tokensFor(id, night);
  const vars: Record<string, string> = {
    '--jg-bg': t.bg,
    '--jg-surface': t.surface,
    '--jg-text': t.text,
    '--jg-text-dim': t.textDim,
    '--jg-accent': t.accent,
    '--jg-on-accent': t.onAccent,
    '--jg-warn': t.warn,
    '--jg-danger': t.danger,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = id;
  root.dataset.night = night ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

/** "HH:MM" range check; ranges may cross midnight (e.g. 18:30–06:00). */
export function isNightTime(now: Date, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h % 24) * 60 + (m % 60);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(start);
  const b = toMin(end);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
