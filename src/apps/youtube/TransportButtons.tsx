// Small YouTube controls shared by the transport row, full-screen column, mini handle and queue sheet:
// back/ahead 10 s and mute (user requests 2026-11-11).
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { useControlSize } from '../../shell/useControlSize';
import { seekBy, toggleMute, usePlayerUi } from './player';

type Size = 'md' | 'row' | 'lg';

/** md: fixed (mini handle, queue sheet); row: transport row under the title; lg: full screen. row and lg follow Toolbar size. */
function useDims(size: Size) {
  const cs = useControlSize();
  if (size === 'lg') return { style: { width: cs.big, height: cs.big }, box: 'rounded-2xl bg-surface', icon: cs.bigIcon - 4, text: 'text-[13px]' };
  if (size === 'row') return { style: { width: cs.rowNarrow, height: cs.row }, box: 'rounded-full', icon: Math.round(cs.rowIcon * 0.77), text: 'text-[11px]' };
  return { style: { width: 44, height: 48 }, box: 'rounded-full', icon: 20, text: 'text-[11px]' };
}

export function SeekButton({ seconds, size = 'md', testId }: { seconds: -10 | 10; size?: Size; testId: string }) {
  const t = useT();
  const z = useDims(size);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(seconds < 0 ? 'yt.back10' : 'yt.forward10')}
      onClick={() => seekBy(seconds)}
      style={z.style}
      className={`flex shrink-0 flex-col items-center justify-center leading-none text-text ${z.box}`}
    >
      <Icon name={seconds < 0 ? 'replay' : 'refresh'} size={z.icon} />
      <span className={`font-bold ${z.text}`}>{t('yt.tenSeconds')}</span>
    </button>
  );
}

export function MuteButton({ size = 'md', testId }: { size?: Size; testId: string }) {
  const t = useT();
  const muted = usePlayerUi((s) => s.muted);
  const z = useDims(size);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(muted ? 'yt.unmute' : 'yt.mute')}
      aria-pressed={muted}
      onClick={toggleMute}
      style={z.style}
      className={`flex shrink-0 items-center justify-center ${z.box} ${muted ? 'bg-warn text-bg' : 'text-text'}`}
    >
      <Icon name={muted ? 'muted' : 'volume'} size={z.icon} />
    </button>
  );
}
