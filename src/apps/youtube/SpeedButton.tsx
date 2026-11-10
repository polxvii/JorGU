import { useSettings } from '../../features/settings/settingsStore';
import { useT } from '../../i18n';
import { cycleSpeed, usePlayerUi } from './player';
import { formatSpeed } from './speed';

/** One-tap speed chip (1× → 1.5× → 2×). Lives outside the player rectangle. */
export function SpeedButton({ size = 'md', testId = 'yt-speed' }: { size?: 'md' | 'lg'; testId?: string }) {
  const t = useT();
  const saved = useSettings((s) => s.youtube.playbackRate);
  const rates = usePlayerUi((s) => s.rates);
  const applied = usePlayerUi((s) => s.rate);
  const rate = rates.length ? applied : saved;
  const fixed = rates.length === 1; // live streams
  const dims = size === 'lg' ? 'h-16 w-16 rounded-2xl text-[18px]' : 'h-12 min-w-14 rounded-full px-2 text-[16px]';
  return (
    <button
      type="button"
      data-testid={testId}
      data-rate={rate}
      aria-label={`${t('yt.speed')} ${formatSpeed(rate)}`}
      disabled={fixed}
      onClick={cycleSpeed}
      className={`tabular flex shrink-0 items-center justify-center font-semibold ${dims} ${
        rate !== 1 ? 'bg-accent text-on-accent' : 'bg-surface text-text'
      } disabled:opacity-50`}
    >
      {formatSpeed(rate)}
    </button>
  );
}
