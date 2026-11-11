// Small YouTube controls shared by the transport row, full-screen column, mini handle and queue sheet:
// back/ahead 10 s and mute (user requests 2026-11-11).
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { seekBy, toggleMute, usePlayerUi } from './player';

const SIZES = {
  md: { box: 'h-12 w-11 rounded-full', icon: 20, text: 'text-[11px]' },
  lg: { box: 'h-16 w-16 rounded-2xl bg-surface', icon: 26, text: 'text-[13px]' },
} as const;

export function SeekButton({ seconds, size = 'md', testId }: { seconds: -10 | 10; size?: keyof typeof SIZES; testId: string }) {
  const t = useT();
  const z = SIZES[size];
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(seconds < 0 ? 'yt.back10' : 'yt.forward10')}
      onClick={() => seekBy(seconds)}
      className={`flex shrink-0 flex-col items-center justify-center leading-none text-text ${z.box}`}
    >
      <Icon name={seconds < 0 ? 'replay' : 'refresh'} size={z.icon} />
      <span className={`font-bold ${z.text}`}>{t('yt.tenSeconds')}</span>
    </button>
  );
}

export function MuteButton({ size = 'md', testId }: { size?: keyof typeof SIZES; testId: string }) {
  const t = useT();
  const muted = usePlayerUi((s) => s.muted);
  const z = SIZES[size];
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t(muted ? 'yt.unmute' : 'yt.mute')}
      aria-pressed={muted}
      onClick={toggleMute}
      className={`flex shrink-0 items-center justify-center ${z.box} ${muted ? 'bg-warn text-bg' : 'text-text'}`}
    >
      <Icon name={muted ? 'muted' : 'volume'} size={z.icon} />
    </button>
  );
}
