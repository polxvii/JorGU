// Web app surface (spec §9): start page, frame check, then the site in a sandboxed iframe rendered at the chosen
// layout width and scaled to the pane (§9.7). Changing the view only restyles the iframe: it never reloads.
// The iframe is created once per URL and never moved (§6.3); Reload re-navigates it in place.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FrameCheckResult } from '../../../shared/webTypes';
import { countFrameLoad } from '../../dev/frameLoads';
import { useSettings } from '../../features/settings/settingsStore';
import type { AppRef, SurfaceId, WebInstanceId } from '../../features/settings/types';
import { useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { checkFrame } from './frameCheck';
import { hostLabel, toHttps } from './normalizeUrl';
import { resolveViewMode, sameView, viewBox } from './viewMode';
import { NewTabLink } from './WebHeaderControls';
import { SiteLists, UrlForm } from './WebParts';
import { useWebUi } from './webStore';

type WebRef = Extract<AppRef, { kind: 'web' }>;

/** §9.5: no top navigation (sites can't take over JorGu); no geolocation, camera, or microphone delegated. */
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';

export function WebSurface({ app, surfaceId, band }: { app: WebRef; surfaceId: SurfaceId; band: number }) {
  if (!app.url) return <StartPage id={app.id} band={band} />;
  // A new URL is a new page: remount (and reload) only then.
  return <WebPage key={app.url} app={app} surfaceId={surfaceId} band={band} />;
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

function WebPage({ app, surfaceId, band }: { app: WebRef; surfaceId: SurfaceId; band: number }) {
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
  return <ScaledFrame id={app.id} url={app.url} src={embed} surfaceId={surfaceId} band={band} status={check.status} />;
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
  const host = hostLabel(url);
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

function ScaledFrame({ id, url, src, surfaceId, band, status }: {
  id: WebInstanceId;
  url: string;
  src: string;
  surfaceId: SurfaceId;
  band: number;
  status: FrameCheckResult['status'];
}) {
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

  // Reload = navigate the same iframe to the page that was opened (a parent can't read a cross-origin frame's URL).
  const firstNonce = useRef(nonce);
  useEffect(() => {
    if (nonce !== firstNonce.current && frame.current) frame.current.src = src;
  }, [nonce, src]);

  // Some sites only pick their layout at load: after a view change, offer "Reload in this view" (§9.7).
  const loadedMode = useRef(mode);
  useEffect(() => {
    setViewPending(id, !sameView(mode, loadedMode.current));
  }, [mode, id, setViewPending]);
  useEffect(() => () => setViewPending(id, false), [id, setViewPending]);

  const v = size ? viewBox(mode, size.w, size.h, desktopWidth) : null;
  return (
    <div ref={wrap} className="absolute inset-x-0 bottom-0 overflow-hidden bg-bg" style={{ top: band }} data-testid={`web-page-${id}`} data-check={status}>
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
          onLoad={() => {
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
  );
}
