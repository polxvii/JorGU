import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { type Repeat, useQueue } from './queueStore';
import { playIndex } from './player';

export function QueueSheet({ rect }: { rect: Rect }) {
  const t = useT();
  const items = useQueue((s) => s.items);
  const index = useQueue((s) => s.index);
  const repeat = useQueue((s) => s.repeat);
  const shuffle = useQueue((s) => s.shuffle);
  const { setRepeat, toggleShuffle, remove, clear } = useQueue.getState();
  const repeats: { value: Repeat; label: string }[] = [
    { value: 'off', label: t('queue.repeatOff') },
    { value: 'all', label: t('queue.repeatAll') },
    { value: 'one', label: t('queue.repeatOne') },
  ];
  return (
    <Sheet rect={rect} title={t('queue.title')} testId="queue-sheet">
      <div className="flex items-center gap-2 py-1">
        <Icon name="repeat" size={22} className="shrink-0 text-text-dim" />
        <div className="flex flex-1 gap-1" role="radiogroup" aria-label={t('queue.repeat')} data-testid="queue-repeat">
          {repeats.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={repeat === r.value}
              data-value={r.value}
              onClick={() => setRepeat(r.value)}
              className={`min-h-12 flex-1 rounded-xl text-[15px] font-semibold ${repeat === r.value ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={shuffle}
          aria-label={t('queue.shuffle')}
          data-testid="queue-shuffle"
          onClick={toggleShuffle}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${shuffle ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
        >
          <Icon name="shuffle" size={22} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-1 py-6 text-center text-text-dim">{t('queue.empty')}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1" data-testid="queue-list">
          {items.map((it, i) => (
            <li key={it.key} className={`flex items-center gap-1 rounded-xl ${i === index ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}>
              <button
                type="button"
                onClick={() => playIndex(i, { auto: false })}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left"
              >
                <span className="tabular w-6 shrink-0 text-right text-[14px] opacity-70">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{it.title ?? t('yt.untitled')}</span>
                  <span className="block truncate text-[13px] opacity-75">
                    {i === index ? t('queue.nowPlaying') : (it.channel ?? it.videoId)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={t('queue.remove')}
                onClick={() => remove(i)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              >
                <Icon name="close" size={20} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {items.length > 0 && (
        <button
          type="button"
          onClick={clear}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-bg text-[15px] font-semibold text-danger"
        >
          <Icon name="trash" size={20} />
          {t('queue.clear')}
        </button>
      )}
    </Sheet>
  );
}
