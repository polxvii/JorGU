// Web app surface (spec §9): start page, frame check, then the site in a sandboxed iframe rendered at the chosen
// layout width and scaled to the pane (§9.7). Changing the view only restyles the iframe: it never reloads.
// The iframe is created once per URL and never moved (§6.3); Reload re-navigates it in place.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FrameCheckResult } from '../../../shared/webTypes';
import { countFrameLoad } from '../../dev/frameLoads';
import { useSettings } from '../../features/settings/settingsStore';
import { useUi } from '../../features/settings/uiStore';
import type { AppRef, SurfaceId, WebInstanceId } from '../../features/settings/types';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { checkFrame } from './frameCheck';
import { hostLabel, searchQuery, searchUrl, toHttps } from './normalizeUrl';
import { MAP_GAP, placeMapChrome } from '../map/mapChrome';
import type { Rect } from '../../shell/geometry';
import { SideStrip, StripButton, type StripItem } from '../../shell/SideStrip';
import { useControlSize } from '../../shell/useControlSize';
import { AUTO, resolveViewMode, sameView, viewBox, zoomStep } from './viewMode';
import { frameGone, frameLoaded, goBack, goForward, installWebHistoryGuard, navigateInPlace } from './webHistory';
import { NewTabLink } from './WebHeaderControls';
import { SiteLists, UrlForm } from './WebParts';
import { useWebUi } from './webStore';

type WebRef = Extract<AppRef, { kind: 'web' }>;

/** §9.5: no top navigation (sites can't take over JorGu); no geolocation, camera, or microphone delegated. */
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';

/** `size` and `avoid` (mini player, full-screen bar; relative to the surface) place the page's toolbar strip. */
interface Place {
  size: { w: number; h: number };
  avoid: Rect[];
}

export function WebSurface({ app, surfaceId, band, size, avoid }: { app: WebRef; surfaceId: SurfaceId; band: number } & Place) {
  if (!app.url) return <StartPage id={app.id} band={band} />;
  // A new URL is a new page: remount (and reload) only then.
  return <WebPage key={app.url} app={app} surfaceId={surfaceId} band={band} size={size} avoid={avoid} />;
}

function StartPage({ id, band }: { id: WebInstanceId; band: number }) {
  const t = useT();
  return (
    <div className="absolute inset-x-0 bottom-0 overflow-y-auto bg-bg px-4 pb-6" style={{ top: band }} data-testid={`web-start-${id}`}>
      <h2 className="mb-2 mt-3 px-1 text-[20px] font-semibold">{t('web.startTitle')}</h2>
      <UrlForm id={id} testId={`web-start-url-${id}`} />
      <div className="mt-2">
        <SiteLists id={id} />
      </div>
    </div>
  );
}

function WebPage({ app, surfaceId, band, size, avoid }: { app: WebRef; surfaceId: SurfaceId; band: number } & Place) {
  const embed = toHttps(app.url);
  const typedHttp = embed !== app.url;
  const [check, setCheck] = useState<FrameCheckResult | null>(null);
  const [tryHttps, setTryHttps] = useState(false);
  useEffect(() => {
    let live = true;
    void checkFrame(embed).then((r) => live && setCheck(r));
    return () => {
      live = false;
    };
  }, [embed]);

  if (!check) return <Notice band={band} id={app.id} kind="checking" url={app.url} />;
  if (check.status === 'blocked') return <Notice band={band} id={app.id} kind="blocked" url={app.url} />;
  if (check.status === 'unknown' && typedHttp && !tryHttps) {
    return <Notice band={band} id={app.id} kind="insecure" url={app.url} onTryHttps={() => setTryHttps(true)} />;
  }
  return <ScaledFrame id={app.id} url={app.url} src={embed} surfaceId={surfaceId} band={band} status={check.status} place={{ size, avoid }} />;
}

function Notice({ id, url, band, kind, onTryHttps }: {
  id: WebInstanceId;
  url: string;
  band: number;
  kind: 'checking' | 'blocked' | 'insecure';
  onTryHttps?: () => void;
}) {
  const t = useT();
  const setWebUrl = useSettings((s) => s.setWebUrl);
  const setSearch = useSettings((s) => s.setWebSearch);
  const host = hostLabel(url);
  const search = searchQuery(url);
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-bg p-6 text-center"
      style={{ top: band }}
      data-testid={`web-${kind}-${id}`}
    >
      <Icon name="web" size={44} className="text-accent" />
      {kind === 'checking' ? (
        <p className="text-[16px] text-text-dim">{t('web.checking', { host })}</p>
      ) : (
        <>
          <p className="max-w-md text-[18px] font-semibold">{t(kind === 'blocked' ? 'web.blockedTitle' : 'web.insecureTitle')}</p>
          <p className="text-[16px] font-semibold text-text-dim">{host}</p>
          <p className="max-w-md text-[14px] text-text-dim">{t(kind === 'blocked' ? 'web.blockedBody' : 'web.insecureBody')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <NewTabLink url={url} label testId={`web-${kind}-newtab-${id}`} />
            {kind === 'blocked' && search?.engine === 'google' && (
              <button
                type="button"
                data-testid={`web-search-bing-${id}`}
                onClick={() => {
                  setSearch('bing');
                  setWebUrl(id, searchUrl(search.q, 'bing'));
                }}
                className="min-h-14 rounded-xl bg-surface px-4 text-[16px] font-semibold"
              >
                {t('web.searchBingHere')}
              </button>
            )}
            {onTryHttps && (
              <button type="button" data-testid={`web-try-https-${id}`} onClick={onTryHttps} className="min-h-14 rounded-xl bg-surface px-4 text-[16px] font-semibold">
                {t('web.tryHttps')}
              </button>
            )}
            <button
              type="button"
              data-testid={`web-${kind}-home-${id}`}
              onClick={() => setWebUrl(id, '')}
              className="min-h-14 rounded-xl bg-surface px-4 text-[16px] font-semibold"
            >
              {t('web.home')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ScaledFrame({ id, url, src, surfaceId, band, status, place }: {
  id: WebInstanceId;
  url: string;
  src: string;
  surfaceId: SurfaceId;
  band: number;
  status: FrameCheckResult['status'];
  place: Place;
}) {
  const t = useT();
  const cs = useControlSize();
  const driverRight = useSettings((s) => s.layout.driverSide) === 'right';
  const setViewMode = useSettings((s) => s.setViewMode);
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const mode = useSettings((s) => resolveViewMode(url, s.web.bookmarks, s.web.viewModes));
  const desktopWidth = useSettings((s) => s.web.desktopWidth);
  const nonce = useWebUi((s) => s.reloadNonce[id] ?? 0);
  const setViewPending = useWebUi((s) => s.setViewPending);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize((s) => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reload = navigate the same iframe to the page that was opened (a parent can't read a cross-origin frame's URL),
  // without adding a Back step.
  const firstNonce = useRef(nonce);
  useEffect(() => {
    if (nonce !== firstNonce.current) navigateInPlace(frame.current, src, id);
  }, [nonce, src, id]);

  // Back / Forward (user 2026-11-13): steps of this frame, counted from its loads (webHistory.ts).
  const loads = useRef(0);
  useEffect(() => {
    installWebHistoryGuard();
    return () => frameGone(id);
  }, [id]);

  // Some sites only pick their layout at load: after a view change, offer "Reload in this view" (§9.7).
  const loadedMode = useRef(mode);
  useEffect(() => {
    setViewPending(id, !sameView(mode, loadedMode.current));
  }, [mode, id, setViewPending]);
  useEffect(() => () => setViewPending(id, false), [id, setViewPending]);

  const v = size ? viewBox(mode, size.w, size.h, desktopWidth) : null;

  // Toolbar (user 2026-11-13): Mobile / Desktop layout and zoom, one tap away instead of in the Web menu. Zoom +/-
  // steps from what's on screen now; in Mobile or Desktop it goes back to Auto at that zoom.
  const scale = v?.scale ?? (mode.mode === 'auto' ? mode.zoom : 1);
  // 🔍 first (user 2026-11-13): change site from the strip, not the header at the top of the screen.
  const openSiteMenu = () => {
    const pane = useSettings.getState().layout.panes.findIndex((a) => a.kind === 'web' && a.id === id);
    if (pane === 0 || pane === 1) useUi.getState().openSheet({ kind: 'web', pane });
  };
  const items: StripItem[] = [
    { key: 'site', node: <StripButton testId={`web-site-${id}`} icon="search" label={t('web.changeSite')} onClick={openSiteMenu} /> },
    { key: 'back', node: <StripButton testId={`web-back-${id}`} icon="back" label={t('web.back')} onClick={() => goBack(id)} /> },
    { key: 'forward', node: <StripButton testId={`web-forward-${id}`} icon="forward" label={t('web.forward')} onClick={() => goForward(id)} /> },
    {
      key: 'mobile',
      node: (
        <StripButton
          testId={`web-mobile-${id}`}
          icon="phone"
          label={t('web.viewMobile')}
          active={mode.mode === 'mobile'}
          onClick={() => setViewMode(url, mode.mode === 'mobile' ? AUTO : { mode: 'mobile' })}
        />
      ),
    },
    {
      key: 'desktop',
      node: (
        <StripButton
          testId={`web-desktop-${id}`}
          icon="desktop"
          label={t('web.viewDesktop')}
          active={mode.mode === 'desktop'}
          onClick={() => setViewMode(url, mode.mode === 'desktop' ? AUTO : { mode: 'desktop' })}
        />
      ),
    },
    {
      key: 'zoomIn',
      node: <StripButton testId={`web-zoom-in-${id}`} icon="plus" label={t('web.zoomIn')} onClick={() => setViewMode(url, { mode: 'auto', zoom: zoomStep(scale, 1) })} />,
    },
    {
      key: 'zoom',
      node: <StripButton testId={`web-zoom-reset-${id}`} text={`${Math.round(scale * 100)}%`} label={t('web.zoomReset')} onClick={() => setViewMode(url, AUTO)} />,
    },
    {
      key: 'zoomOut',
      node: <StripButton testId={`web-zoom-out-${id}`} icon="minus" label={t('web.zoomOut')} onClick={() => setViewMode(url, { mode: 'auto', zoom: zoomStep(scale, -1) })} />,
    },
  ];
  const ui = placeMapChrome({
    w: place.size.w,
    h: place.size.h,
    top: Math.max(MAP_GAP, band + 4),
    btn: cs.map,
    items: items.length,
    right: driverRight,
    avoid: place.avoid,
    routeBox: false,
    routeBoxAt: 'bottom',
  });
  return (
    <>
      <SideStrip prefix={`web-${id}`} ui={ui} items={items} height={place.size.h} moreLabel={t('web.more')} />
      <div
        ref={wrap}
        className="absolute bottom-0 overflow-hidden bg-bg"
        style={{ top: band, left: ui.canvas.x, width: ui.canvas.w }}
        data-testid={`web-page-${id}`}
        data-check={status}
      >
      {v && (
        <iframe
          ref={frame}
          title={hostLabel(url)}
          src={src}
          sandbox={SANDBOX}
          allow={ALLOW}
          referrerPolicy="strict-origin-when-cross-origin"
          data-testid={`web-frame-${id}`}
          data-view={mode.mode}
          data-scale={v.scale.toFixed(3)}
          data-loads={loads.current}
          onLoad={() => {
            frameLoaded(id, loads.current++ === 0);
            countFrameLoad(surfaceId);
            loadedMode.current = mode;
            setViewPending(id, false);
          }}
          className="absolute top-0 border-0 bg-white"
          style={{
            left: v.offsetX,
            width: v.width,
            height: v.height,
            transform: v.scale === 1 ? undefined : `scale(${v.scale})`,
            transformOrigin: '0 0',
          }}
        />
      )}
      </div>
    </>
  );
}
