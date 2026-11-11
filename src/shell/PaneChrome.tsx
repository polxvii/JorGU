// Pane header (≤ 40 px, auto-hides), the always-visible ⛶ button, and drag-to-swap (spec §6.2).
// Drag feedback stays on the headers: nothing follows the finger across a YouTube player (§3.9).
// Web panes keep their header (with the web controls) on screen: it sits in a band above the site (§9.1).
import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import { useUi } from '../features/settings/uiStore';
import type { PaneIndex } from '../features/settings/types';
import { WebHeaderControls } from '../apps/web/WebHeaderControls';
import { type MessageKey, useT } from '../i18n';
import type { LayoutResult, PaneBox } from './computeLayout';
import { enterFullscreen } from './fullscreen';
import { Icon, type IconName } from './Icon';

const DRAG_THRESHOLD = 10;
const DOUBLE_TAP_MS = 320;

const APP_LABEL: Record<string, MessageKey> = {
  map: 'apps.map',
  youtube: 'apps.youtube',
  web: 'apps.web',
};

function paneAt(layout: LayoutResult, x: number, y: number): PaneIndex | null {
  for (const p of layout.panes) {
    const r = p.rect;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return p.index;
  }
  return null;
}

function PaneHeader({ pane, layout }: { pane: PaneBox; layout: LayoutResult }) {
  const t = useT();
  const visible = useUi((s) => s.headersVisible);
  const drag = useUi((s) => s.drag);
  const openSheet = useUi((s) => s.openSheet);
  const swap = useSettings((s) => s.swap);
  const state = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const lastTap = useRef(0);
  const canDrag = layout.panes.length === 2;
  const lifted = drag?.from === pane.index;
  const target = drag?.over === pane.index && drag.from !== pane.index;
  const driverRight = layout.driverSide === 'right';
  const web = pane.app.kind === 'web' ? pane.app : null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    state.current = { x: e.clientX, y: e.clientY, dragging: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || !canDrag) return;
    if (!s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD) s.dragging = true;
    if (s.dragging) {
      const over = paneAt(layout, e.clientX, e.clientY);
      useUi.getState().setDrag({ from: pane.index, over: over === pane.index ? null : over });
    }
  };
  const finish = (commit: boolean) => {
    const s = state.current;
    state.current = null;
    const d = useUi.getState().drag;
    useUi.getState().setDrag(null);
    if (!s) return;
    if (s.dragging) {
      if (commit && d && d.over !== null && d.over !== d.from) swap();
      return;
    }
    if (!commit) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      enterFullscreen(pane.index);
    } else {
      lastTap.current = now;
    }
  };

  return (
    <div
      data-chrome="pane-header"
      data-pane={pane.index}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      className={`absolute z-10 flex items-center gap-2 px-2 ${driverRight ? 'flex-row' : 'flex-row-reverse'} ${
        target ? 'bg-accent text-on-accent' : 'bg-surface/90 text-text'
      } ${lifted ? 'ring-2 ring-accent' : ''}`}
      style={{
        left: pane.header.x,
        top: pane.header.y,
        width: pane.header.w,
        height: pane.header.h,
        visibility: visible || drag || web ? 'visible' : 'hidden',
        touchAction: 'none',
        // Leave room for the ⛶ button on the driver side.
        [driverRight ? 'paddingRight' : 'paddingLeft']: 56,
      }}
      title={canDrag ? t('pane.dragToSwap') : undefined}
    >
      {canDrag && <Icon name="grip" size={18} className="shrink-0 opacity-60" />}
      {web ? (
        <WebHeaderControls pane={pane.index} app={web} />
      ) : (
        <>
          <Icon name={pane.app.kind as IconName} size={20} className="shrink-0" />
          <span className="min-w-0 truncate text-[15px] font-semibold">{t(APP_LABEL[pane.app.kind])}</span>
          <span className="flex-1" />
        </>
      )}
      <button
        type="button"
        data-testid={`pane-change-${pane.index}`}
        onClick={() => openSheet({ kind: 'picker', pane: pane.index })}
        className="h-8 shrink-0 rounded-lg bg-bg/70 px-3 text-[14px] font-semibold text-text"
      >
        {t('pane.change')}
      </button>
    </div>
  );
}

function FullscreenButton({ pane }: { pane: PaneBox }) {
  const t = useT();
  const r = pane.fsButton;
  return (
    <button
      type="button"
      data-chrome="fs-button"
      data-testid={`pane-fullscreen-${pane.index}`}
      aria-label={t('pane.fullscreen')}
      onClick={() => enterFullscreen(pane.index)}
      className="absolute z-[11] flex items-center justify-center rounded-xl bg-bg/60 text-text"
      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
    >
      <Icon name="fullscreen" size={26} />
    </button>
  );
}

export function PaneChrome({ layout }: { layout: LayoutResult }) {
  return (
    <>
      {layout.panes.map((p) => (
        <PaneHeader key={`h${p.index}`} pane={p} layout={layout} />
      ))}
      {layout.panes.map((p) => (
        <FullscreenButton key={`f${p.index}`} pane={p} />
      ))}
    </>
  );
}
