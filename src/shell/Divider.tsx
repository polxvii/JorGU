// Draggable divider between panes (spec §6.2): 30–70 %, snaps at 40/50/60 %, keeps the YouTube pane big enough.
// Vertical when panes sit side by side, horizontal when they're stacked top/bottom.
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useT } from '../i18n';
import { type LayoutResult, L } from './computeLayout';
import { resolveRatio } from './splitRatio';

export function Divider({ layout }: { layout: LayoutResult }) {
  const t = useT();
  const ratio = useSettings((s) => s.layout.splitRatio);
  const setSplitRatio = useSettings((s) => s.setSplitRatio);
  const dragging = useRef(false);
  const { divider, bounds, appArea, splitLength, firstPane, stacked } = layout;
  if (!divider || !bounds) return null;

  // Ratio is pane 0's share; the first pane (left / top) may be pane 1 when the layout is mirrored.
  const fromFirstShare = (firstShare: number) => (firstPane === 0 ? firstShare : 1 - firstShare);
  const apply = (pane0Share: number) => setSplitRatio(resolveRatio(pane0Share, bounds));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || splitLength <= 0) return;
    const firstLen = stacked ? e.clientY - appArea.y - L.GAP / 2 : e.clientX - appArea.x - L.GAP / 2;
    apply(fromFirstShare(firstLen / splitLength));
  };
  const stop = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const [less, more] = stacked ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    const step = e.key === less ? -0.05 : e.key === more ? 0.05 : 0;
    if (!step) return;
    e.preventDefault();
    const firstShare = firstPane === 0 ? ratio : 1 - ratio;
    apply(fromFirstShare(firstShare + step));
  };

  const hit = divider.hit;
  const line = divider.line;
  const value = Math.round((firstPane === 0 ? ratio : 1 - ratio) * 100);
  return (
    <div
      data-chrome="divider"
      data-testid="divider"
      role="separator"
      aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-label={t('divider.label')}
      aria-valuenow={value}
      aria-valuemin={Math.round(bounds.min * 100)}
      aria-valuemax={Math.round(bounds.max * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      className={`absolute z-10 ${stacked ? 'cursor-row-resize' : 'cursor-col-resize'}`}
      style={{ left: hit.x, top: hit.y, width: hit.w, height: hit.h, touchAction: 'none' }}
    >
      <div
        className="absolute bg-bg"
        style={{ left: line.x - hit.x, top: line.y - hit.y, width: line.w, height: line.h }}
      >
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-dim ${stacked ? 'h-1.5 w-16' : 'h-16 w-1.5'}`}
        />
      </div>
    </div>
  );
}
