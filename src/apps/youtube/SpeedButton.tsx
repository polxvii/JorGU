import { useContext } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useT } from '../../i18n';
import { useControlSize } from '../../shell/useControlSize';
import { cycleSpeed, usePlayerUi } from './player';
import { formatSpeed } from './speed';
import { RowScale } from './TransportButtons';

/** One-tap speed chip (1× → 1.5× → 2×). Lives outside the player rectangle. */
export function SpeedButton({ size = 'md', testId = 'yt-speed' }: { size?: 'md' | 'row' | 'lg'; testId?: string }) {
  const t = useT();
  const saved = useSettings((s) => s.youtube.playbackRate);
  const rates = usePlayerUi((s) => s.rates);
  const applied = usePlayerUi((s) => s.rate);
  const rate = rates.length ? applied : saved;
  const fixed = rates.length === 1; // live streams
  const cs = useControlSize();
  const k = useContext(RowScale);
  // md is fixed (mini handle, queue sheet); row and lg follow Toolbar size.
  const dims = size === 'lg' ? 'rounded-2xl' : 'rounded-full px-2';
  const style =
    size === 'lg'
      ? { width: cs.big, height: cs.big, fontSize: cs.bigIcon - 12 }
      : size === 'row'
        ? { height: Math.round(cs.row * k), minWidth: Math.round(cs.rowWide * k), fontSize: Math.round(cs.rowIcon * 0.62 * k) }
        : { height: 48, minWidth: 56, fontSize: 16 };
  return (
    <button
      type="button"
      data-testid={testId}
      data-rate={rate}
      aria-label={`${t('yt.speed')} ${formatSpeed(rate)}`}
      disabled={fixed}
      onClick={cycleSpeed}
      style={style}
      className={`tabular flex shrink-0 items-center justify-center font-semibold ${dims} ${
        rate !== 1 ? 'bg-accent text-on-accent' : 'bg-surface text-text'
      } disabled:opacity-50`}
    >
      {formatSpeed(rate)}
    </button>
  );
}
