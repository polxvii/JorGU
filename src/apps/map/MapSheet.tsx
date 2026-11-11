// "Where to?" (spec §7.3): type a destination or pick a saved place / recent one. "Show route" stays in JorGu:
// the route is drawn on the live map (§7.4). Handing the trip to the Google Maps app (voice guidance) is a separate,
// explicit button on the route card (user request 2026-11-11: searching must not jump to Google Maps).
// Plain text is passed on as is: no Places Autocomplete (an extra billed SKU).
import { type ReactNode, useState } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { endRoute, startRoute, useMapUi } from './mapController';
import { mapsNavigateUrl } from './navigate';

function useShowRoute() {
  const addRecent = useSettings((s) => s.addRecentDestination);
  const close = useUi((s) => s.closeSheet);
  return (destination: string) => {
    const d = destination.trim();
    if (!d) return;
    addRecent(d);
    startRoute(d);
    close();
  };
}

function Row({ onClick, testId, children }: { onClick: () => void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-xl bg-bg px-4 text-left text-[16px] font-semibold text-text"
    >
      {children}
    </button>
  );
}

function AvoidChip({ what, label }: { what: 'avoidTolls' | 'avoidHighways'; label: string }) {
  const on = useSettings((s) => s.map[what]);
  const set = useSettings((s) => s.setMapAvoid);
  return (
    <button
      type="button"
      data-testid={what === 'avoidTolls' ? 'map-avoid-tolls' : 'map-avoid-highways'}
      aria-pressed={on}
      onClick={() => set(what, !on)}
      className={`flex min-h-12 items-center gap-1 rounded-xl px-3 text-[15px] font-semibold ${on ? 'bg-accent text-on-accent' : 'bg-bg text-text'}`}
    >
      {on && <Icon name="close" size={18} />}
      {label}
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mt-3 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{children}</h3>;
}

function AddPlace() {
  const t = useT();
  const add = useSettings((s) => s.addSavedPlace);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  if (!open) {
    return (
      <button type="button" data-testid="map-add-place" onClick={() => setOpen(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-bg text-[16px] font-semibold">
        <Icon name="plus" size={22} />
        {t('map.addPlace')}
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-bg p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!query.trim()) return;
        add(label, query);
        setOpen(false);
        setLabel('');
        setQuery('');
      }}
    >
      <input
        data-testid="map-place-label"
        value={label}
        placeholder={t('map.placeLabel')}
        aria-label={t('map.placeLabel')}
        onChange={(e) => setLabel(e.target.value)}
        className="min-h-14 rounded-xl bg-surface px-3 text-[16px] text-text select-text"
      />
      <input
        data-testid="map-place-query"
        value={query}
        placeholder={t('map.placeQuery')}
        aria-label={t('map.placeQuery')}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-14 rounded-xl bg-surface px-3 text-[16px] text-text select-text"
      />
      <div className="flex gap-2">
        <button type="submit" data-testid="map-place-save" className="min-h-14 flex-1 rounded-xl bg-accent text-[16px] font-semibold text-on-accent">
          {t('web.save')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-14 flex-1 rounded-xl bg-surface text-[16px] font-semibold">
          {t('web.cancel')}
        </button>
      </div>
    </form>
  );
}

export function MapSheet({ rect }: { rect: Rect }) {
  const t = useT();
  const show = useShowRoute();
  const places = useSettings((s) => s.map.savedPlaces);
  const recent = useSettings((s) => s.map.recentDestinations);
  const removePlace = useSettings((s) => s.removeSavedPlace);
  const route = useMapUi((s) => s.route);
  const avoidAny = useSettings((s) => s.map.avoidTolls || s.map.avoidHighways);
  const [text, setText] = useState('');
  const dest = text.trim();
  return (
    <Sheet rect={rect} title={t('map.whereTo')} testId="map-sheet">
      <div className="flex flex-col gap-2 pt-1">
        {route && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg p-2 pl-3" data-testid="map-sheet-route">
            <Icon name="navigate" size={22} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{route.destination}</span>
            <a
              href={mapsNavigateUrl(route.destination)}
              target="_blank"
              rel="noopener"
              data-testid="map-sheet-navigate"
              className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl bg-accent px-3 text-[15px] font-semibold text-on-accent"
            >
              <Icon name="external" size={20} />
              {t('map.navigateGoogle')}
            </a>
            <button type="button" data-testid="map-sheet-end" onClick={endRoute} className="min-h-12 shrink-0 rounded-xl bg-surface px-3 text-[15px] font-semibold">
              {t('map.endRoute')}
            </button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            show(dest);
          }}
        >
          <input
            data-testid="map-dest-input"
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            value={text}
            placeholder={t('map.destPlaceholder')}
            aria-label={t('map.destPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            className="min-h-14 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[16px] text-text select-text"
          />
          <button
            type="submit"
            data-testid="map-dest-go"
            disabled={!dest}
            className="flex min-h-14 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-[16px] font-semibold text-on-accent disabled:bg-bg disabled:text-text-dim"
          >
            <Icon name="navigate" size={22} />
            {t('map.showRouteBtn')}
          </button>
        </form>
        <div className="flex flex-wrap gap-2" data-testid="map-avoid">
          <AvoidChip what="avoidTolls" label={t('map.avoidTolls')} />
          <AvoidChip what="avoidHighways" label={t('map.avoidHighways')} />
        </div>
        <p className="px-1 text-[13px] text-text-dim">{t('map.handoffHint')}</p>
        {avoidAny && <p className="px-1 text-[13px] text-text-dim">{t('map.avoidHint')}</p>}

        <SectionTitle>{t('map.savedPlaces')}</SectionTitle>
        <ul className="flex flex-col gap-2" data-testid="map-places">
          {places.map((p) => (
            <li key={p.id} className="flex gap-1">
              <Row testId={`map-place-${p.id}`} onClick={() => show(p.query)}>
                <Icon name="star" size={20} className="shrink-0 text-accent" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{p.label}</span>
                  <span className="truncate text-[13px] font-normal text-text-dim">{p.query}</span>
                </span>
              </Row>
              <button type="button" aria-label={t('map.removePlace')} onClick={() => removePlace(p.id)} className="flex h-14 w-12 shrink-0 items-center justify-center rounded-xl bg-bg">
                <Icon name="trash" size={20} />
              </button>
            </li>
          ))}
        </ul>
        <AddPlace />

        {recent.length > 0 && (
          <>
            <SectionTitle>{t('map.recent')}</SectionTitle>
            <ul className="flex flex-col gap-2" data-testid="map-recent">
              {recent.map((d, i) => (
                <li key={d} className="flex gap-1">
                  <Row testId={`map-recent-${i}`} onClick={() => show(d)}>
                    <Icon name="navigate" size={20} className="shrink-0 text-text-dim" />
                    <span className="truncate font-normal">{d}</span>
                  </Row>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
