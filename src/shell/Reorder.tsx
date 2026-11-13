// Change the order of saved web pages and saved places (user 2026-11-13): a section title with "Change order", and
// ▲ ▼ on each row while it's on. Buttons, not drag, so it works with big fingers in a car.
import { useT } from '../i18n';
import { Icon } from './Icon';

export function ReorderTitle({ title, on, onToggle, testId, show }: { title: string; on: boolean; onToggle: () => void; testId: string; show: boolean }) {
  const t = useT();
  return (
    <div className="mt-2 flex items-center justify-between gap-2 px-1">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-text-dim">{title}</h3>
      {show && (
        <button
          type="button"
          data-testid={testId}
          aria-pressed={on}
          onClick={onToggle}
          className={`flex min-h-10 items-center gap-1 rounded-lg px-3 text-[14px] font-semibold ${on ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
        >
          {!on && <Icon name="sort" size={18} />}
          {t(on ? 'list.reorderDone' : 'list.reorder')}
        </button>
      )}
    </div>
  );
}

export function MoveButtons({ index, count, onMove, testId }: { index: number; count: number; onMove: (dir: -1 | 1) => void; testId: string }) {
  const t = useT();
  const cls = 'flex h-14 w-12 shrink-0 items-center justify-center rounded-xl bg-bg disabled:opacity-30';
  return (
    <>
      <button type="button" data-testid={`${testId}-up`} aria-label={t('list.moveUp')} disabled={index === 0} onClick={() => onMove(-1)} className={cls}>
        <Icon name="up" size={22} />
      </button>
      <button type="button" data-testid={`${testId}-down`} aria-label={t('list.moveDown')} disabled={index === count - 1} onClick={() => onMove(1)} className={cls}>
        <Icon name="down" size={22} />
      </button>
    </>
  );
}
