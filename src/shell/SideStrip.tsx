// A pane's own toolbar: a strip along the driver-side edge with its buttons, and "More" for what doesn't fit (map,
// web; user 2026-11-12/13). Where it goes comes from placeMapChrome (mapChrome.ts): clear of the mini player and the
// full-screen floating bar. Never used over the YouTube player (its controls are laid out by computeLayout).
import { Fragment, type ReactNode, useState } from 'react';
import { MAP_GAP, type MapChrome } from '../apps/map/mapChrome';
import { Icon, type IconName } from './Icon';
import { useControlSize } from './useControlSize';

export const STRIP_BUTTON = 'flex items-center justify-center rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.35)]';

export interface StripItem {
  key: string;
  node: ReactNode;
}

export function StripButton({ icon, label, onClick, active, testId, text, disabled }: {
  icon?: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId: string;
  /** Short text instead of an icon (e.g. "125%"). */
  text?: string;
}) {
  const cs = useControlSize();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{ width: cs.map, height: cs.map, direction: 'ltr' }}
      className={`${STRIP_BUTTON} ${active ? 'bg-accent text-on-accent' : 'bg-surface text-text'} disabled:opacity-35`}
    >
      {text ? <span className="tabular text-[15px] font-bold">{text}</span> : icon && <Icon name={icon} size={cs.mapIcon} />}
    </button>
  );
}

export function SideStrip({ prefix, ui, items, height, moreLabel, extra }: {
  /** Test ids: `${prefix}-strip`, `-controls`, `-more`, `-more-menu`. */
  prefix: string;
  ui: MapChrome;
  items: StripItem[];
  height: number;
  moreLabel: string;
  /** Shown under the buttons when there's room (the map's speed). */
  extra?: ReactNode;
}) {
  const cs = useControlSize();
  const [moreOpen, setMoreOpen] = useState(false);
  const shown = items.slice(0, ui.shown);
  const hidden = items.slice(ui.shown);
  const step = cs.map + MAP_GAP;
  const menuH = hidden.length * step - MAP_GAP;
  const menuTop = Math.max(MAP_GAP, Math.min(height - MAP_GAP - menuH, ui.buttons.y + ui.shown * step + cs.map - menuH));
  const side = ui.right ? 'right' : 'left';
  return (
    <>
      <div data-testid={`${prefix}-strip`} className="absolute bg-surface" style={{ left: ui.strip.x, top: 0, width: ui.strip.w, height }} />
      <div className="absolute flex flex-col" style={{ left: ui.buttons.x, top: ui.buttons.y, gap: MAP_GAP }} data-testid={`${prefix}-controls`} data-side={side}>
        {shown.map((i) => (
          <Fragment key={i.key}>{i.node}</Fragment>
        ))}
        {ui.more && <StripButton testId={`${prefix}-more`} icon="more" label={moreLabel} active={moreOpen} onClick={() => setMoreOpen((o) => !o)} />}
        {ui.speed && extra}
      </div>
      {ui.more && moreOpen && (
        // Opens beside the strip; any choice closes it.
        <div
          data-testid={`${prefix}-more-menu`}
          className="absolute flex flex-col"
          style={{ top: menuTop, [side]: ui.strip.w + MAP_GAP, gap: MAP_GAP }}
          onClick={() => setMoreOpen(false)}
        >
          {hidden.map((i) => (
            <Fragment key={i.key}>{i.node}</Fragment>
          ))}
        </div>
      )}
    </>
  );
}
