import type { ReactNode } from 'react';
import type { VideoItem } from '../../../../shared/ytTypes';
import { useSettings } from '../../../features/settings/settingsStore';
import { useUi } from '../../../features/settings/uiStore';
import { type MessageKey, useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { queueVideos } from '../playActions';
import { useQueue } from '../queueStore';
import { type SkipReason, isMuted, useSeen } from '../seenStore';
import { formatAge } from './age';
import type { LoadState } from './useLoad';

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function Thumb({ src }: { src: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className="h-[54px] w-24 shrink-0 rounded-lg bg-surface object-cover" />
  ) : (
    <span className="h-[54px] w-24 shrink-0 rounded-lg bg-surface" />
  );
}

/** Channel · length · age; the length and age are never cut off, a long channel name is. */
function Meta({ channel, meta }: { channel: string; meta: string }) {
  return (
    <span className="flex min-w-0 text-[13px] text-text-dim" data-testid="lib-meta">
      <span className="truncate">{channel}</span>
      {meta && <span className="shrink-0 whitespace-pre">{channel ? ` · ${meta}` : meta}</span>}
    </span>
  );
}

const BADGE: Record<SkipReason, MessageKey> = { played: 'library.played', hidden: 'library.hiddenBadge', muted: 'library.hiddenBadge' };

/** Hide a clip from New, Trending and Mix; the toast offers to hide its whole channel (user 2026-11-15). */
export function hideClip(v: VideoItem): void {
  const seen = useSeen.getState();
  seen.hide(v.videoId);
  // Not later in the queue either (rest of a list, Mix).
  useQueue.getState().filterAuto((it) => it.videoId !== v.videoId);
  useUi.getState().showToast({
    message: 'toast.hidden',
    params: { title: v.title },
    action: {
      label: 'toast.muteChannel',
      run: () => {
        useSeen.getState().mute(v.channelId || v.channel, v.channel);
        useQueue.getState().filterAuto((it) => it.channel !== v.channel);
        useUi.getState().showToast({ message: 'toast.channelMuted', params: { title: v.channel } });
      },
    },
  });
}

/**
 * Tap a row = play now. "+" = add to the end of the queue. Clips played in JorGu (30 days) or hidden carry a
 * badge (`marks`, on by default); `hideButton` adds the hide / show-again button (New, Trending).
 */
export function VideoList({ items, onPlay, testId, subtitle, marks = true, hideButton = false }: {
  items: VideoItem[];
  onPlay: (index: number) => void;
  testId: string;
  subtitle?: (v: VideoItem) => string;
  marks?: boolean;
  hideButton?: boolean;
}) {
  const t = useT();
  const showToast = useUi((s) => s.showToast);
  const lang = useSettings((s) => s.language);
  const played = useSeen((s) => s.played);
  const hidden = useSeen((s) => s.hidden);
  const muted = useSeen((s) => s.muted);
  const now = Date.now();
  const mark = (v: VideoItem): SkipReason | null =>
    !marks ? null : hidden[v.videoId] ? 'hidden' : isMuted(v, { muted }) ? 'muted' : played[v.videoId] ? 'played' : null;
  return (
    <ul className="flex flex-col gap-1" data-testid={testId}>
      {items.map((v, i) => {
        const m = mark(v);
        return (
          <li key={`${v.videoId}-${i}`} data-video-id={v.videoId} data-mark={m ?? undefined} className="flex items-center rounded-xl bg-bg">
            <button type="button" onClick={() => onPlay(i)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-2 text-left">
              <span className={`relative flex shrink-0 ${m ? 'opacity-60' : ''}`}>
                <Thumb src={v.thumb} />
                {m && (
                  <span data-testid="lib-mark" className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/75 py-0.5 text-center text-[11px] font-semibold text-white">
                    {t(BADGE[m])}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{v.title}</span>
                {subtitle ? (
                  <span className="block truncate text-[13px] text-text-dim">{subtitle(v)}</span>
                ) : (
                  <Meta channel={v.channel} meta={[v.duration ? formatDuration(v.duration) : '', formatAge(v.publishedAt, lang, now)].filter(Boolean).join(' · ')} />
                )}
              </span>
            </button>
            {hideButton && (
              <button
                type="button"
                aria-label={t(m === 'hidden' ? 'library.unhide' : 'library.hide')}
                data-testid="lib-hide"
                onClick={() => (m === 'hidden' ? useSeen.getState().unhide(v.videoId) : hideClip(v))}
                className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl text-text-dim"
              >
                <Icon name={m === 'hidden' ? 'eye' : 'hide'} size={22} />
              </button>
            )}
            <button
              type="button"
              aria-label={t('paste.addToQueue')}
              data-testid="lib-add"
              onClick={() => {
                queueVideos([v]);
                showToast({ message: 'library.added', params: { title: v.title } });
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text"
            >
              <Icon name="plus" size={22} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const ERRORS: Record<string, MessageKey> = {
  OFFLINE: 'library.error.offline',
  QUOTA: 'library.error.quota',
  REAUTH: 'library.error.reauth',
  NOT_CONNECTED: 'library.error.reauth',
  NOT_CONFIGURED: 'account.unavailable',
};

export function errorKey(code: string): MessageKey {
  return ERRORS[code] ?? 'library.error.generic';
}

/** Loading / error / stale notice + refresh button around a loaded list. */
export function LoadFrame<T>({ state, empty, children }: {
  state: LoadState<T> & { reload: () => void };
  empty: MessageKey;
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  const data = state.data;
  const isEmpty = Array.isArray(data) && data.length === 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-12 items-center gap-2">
        <p role="status" data-testid="lib-status" className="min-w-0 flex-1 text-[14px] text-text-dim">
          {state.loading
            ? t('library.loading')
            : state.error
              ? t(errorKey(state.error))
              : state.stale
                ? t('library.stale')
                : ''}
        </p>
        <button
          type="button"
          aria-label={t('library.refresh')}
          data-testid="lib-refresh"
          onClick={state.reload}
          disabled={state.loading}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg text-text disabled:opacity-40"
        >
          <Icon name="refresh" size={22} />
        </button>
      </div>
      {data !== undefined && (isEmpty ? <p className="py-6 text-center text-text-dim">{t(empty)}</p> : children(data))}
    </div>
  );
}
