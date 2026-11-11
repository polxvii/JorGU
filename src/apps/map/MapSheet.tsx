// "Where to?" (spec §7.3): type a destination or pick a saved place / recent one. Navigate hands the trip to the
// Google Maps app (voice guidance there) and starts the route overview here (§7.4). Plain text is passed to
// Google Maps, which resolves it: no Places Autocomplete (an extra billed SKU).
import { type ReactNode, useState } from 'react';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { endRoute, startRoute, useMapUi } from './mapController';
import { mapsAppSchemeUrl, mapsNavigateUrl } from './navigate';

function useGo() {
  const addRecent = useSettings((s) => s.addRecentDestination);
  const close = useUi((s) => s.closeSheet);
  return (destination: string) => {
    addRecent(destination);
    startRoute(destination);
    close();
  };
}

/** A real link (most reliable way to hand off to the Maps app from a tap); the route overview starts on the same tap. */
function NavigateLink({ destination, testId, children, primary, row }: {
  destination: string;
  testId: string;
  children: ReactNode;
  primary?: boolean;
  /** Full-width list row instead of a button. */
  row?: boolean;
}) {
  const go = useGo();
  return (
    <a
      href={mapsNavigateUrl(destination)}
      target="_blank"
      rel="noopener"
      data-testid={testId}
      onClick={() => go(destination)}
      className={`flex min-h-14 items-center gap-2 rounded-xl px-4 text-[16px] font-semibold ${
        row ? 'min-w-0 flex-1 justify-start bg-bg text-left text-text' : `shrink-0 justify-center ${primary ? 'bg-accent text-on-accent' : 'bg-surface text-text'}`
      }`}
    >
      {children}
    </a>
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
  const go = useGo();
  const places = useSettings((s) => s.map.savedPlaces);
  const recent = useSettings((s) => s.map.recentDestinations);
  const removePlace = useSettings((s) => s.removeSavedPlace);
  const route = useMapUi((s) => s.route);
  const [text, setText] = useState('');
  const dest = text.trim();
  return (
    <Sheet rect={rect} title={t('map.whereTo')} testId="map-sheet">
      <div className="flex flex-col gap-2 pt-1">
        {route && (
          <div className="flex items-center gap-2 rounded-xl bg-bg p-2 pl-3" data-testid="map-sheet-route">
            <Icon name="navigate" size={22} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{route.destination}</span>
            <button type="button" data-testid="map-sheet-end" onClick={endRoute} className="min-h-12 shrink-0 rounded-xl bg-surface px-3 text-[15px] font-semibold">
              {t('map.endRoute')}
            </button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dest) return;
            window.open(mapsNavigateUrl(dest), '_blank', 'noopener');
            go(dest);
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
          {dest ? (
            <NavigateLink destination={dest} testId="map-dest-go" primary>
              <Icon name="navigate" size={22} />
              {t('map.navigate')}
            </NavigateLink>
          ) : (
            <span className="flex min-h-14 shrink-0 items-center rounded-xl bg-bg px-4 text-[16px] font-semibold text-text-dim">{t('map.navigate')}</span>
          )}
        </form>
        {dest && (
          <a href={mapsAppSchemeUrl(dest)} data-testid="map-dest-app" className="px-1 text-[14px] text-accent underline">
            {t('map.openAppScheme')}
          </a>
        )}
        <p className="px-1 text-[13px] text-text-dim">{t('map.handoffHint')}</p>

        <SectionTitle>{t('map.savedPlaces')}</SectionTitle>
        <ul className="flex flex-col gap-2" data-testid="map-places">
          {places.map((p) => (
            <li key={p.id} className="flex gap-1">
              <NavigateLink destination={p.query} testId={`map-place-${p.id}`} row>
                <Icon name="star" size={20} className="shrink-0 text-accent" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{p.label}</span>
                  <span className="truncate text-[13px] font-normal text-text-dim">{p.query}</span>
                </span>
              </NavigateLink>
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
                  <NavigateLink destination={d} testId={`map-recent-${i}`} row>
                    <Icon name="navigate" size={20} className="shrink-0 text-text-dim" />
                    <span className="truncate font-normal">{d}</span>
                  </NavigateLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
