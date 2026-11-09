// Draggable divider between panes (spec §6.2): 30–70 %, snaps at 40/50/60 %, keeps the YouTube pane ≥ 356 px.
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
  const { divider, bounds, appArea, usableWidth, leftPane } = layout;
  if (!divider || !bounds) return null;

  const fromLeftShare = (leftShare: number) => (leftPane === 0 ? leftShare : 1 - leftShare);
  const apply = (pane0Share: number) => setSplitRatio(resolveRatio(pane0Share, bounds));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || usableWidth <= 0) return;
    const leftW = e.clientX - appArea.x - L.GAP / 2;
    apply(fromLeftShare(leftW / usableWidth));
  };
  const stop = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!step) return;
    e.preventDefault();
    const leftShare = leftPane === 0 ? ratio : 1 - ratio;
    apply(fromLeftShare(leftShare + step));
  };

  const hit = divider.hit;
  const line = divider.line;
  const value = Math.round((leftPane === 0 ? ratio : 1 - ratio) * 100);
  return (
    <div
      data-chrome="divider"
      data-testid="divider"
      role="separator"
      aria-orientation="vertical"
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
      className="absolute z-10 cursor-col-resize"
      style={{ left: hit.x, top: hit.y, width: hit.w, height: hit.h, touchAction: 'none' }}
    >
      <div
        className="absolute bg-bg"
        style={{ left: line.x - hit.x, top: 0, width: line.w, height: line.h }}
      >
        <div className="absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-dim" />
      </div>
    </div>
  );
}
