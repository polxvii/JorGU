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

/**
 * Channel and age ("3 days ago"): one line when they fit, else the age wraps under the channel, so a narrow row
 * (hide + add buttons, big sheets) never squeezes the channel away (live screenshot 2026-11-15). The length is on
 * the thumbnail, YouTube style.
 */
function Meta({ channel, age }: { channel: string; age: string }) {
  return (
    <span className="flex min-w-0 flex-wrap gap-x-2 text-[13px] leading-snug text-text-dim" data-testid="lib-meta">
      {channel && <span className="max-w-full truncate">{channel}</span>}
      {age && <span className="whitespace-nowrap" data-testid="lib-age">{age}</span>}
    </span>
  );
}

const BADGE: Record<SkipReason, MessageKey> = { played: 'library.played', hidden: 'library.hiddenBadge', muted: 'library.hiddenBadge' };

/** Hide a clip from New and Trending; the toast offers to hide its whole channel (user 2026-11-15). */
export function hideClip(v: VideoItem): void {
  const seen = useSeen.getState();
  seen.hide(v.videoId);
  // Not later in the queue either (rest of a list).
  useQueue.getState().filterAuto((it) => it.videoId !== v.videoId);
  useUi.getState().showToast({
    message: 'toast.hidden',
    params: { title: v.title },
    action: {
      label: 'toast.muteChannel',
      run: () => {
        const key = v.channelId || v.channel;
        useSeen.getState().mute(key, v.channel);
        useQueue.getState().filterAuto((it) => it.channel !== v.channel);
        // Hid the wrong one (user 2026-11-15): Undo, or turn it back on in "Channels in New".
        useUi.getState().showToast({
          message: 'toast.channelMuted',
          params: { title: v.channel },
          action: { label: 'toast.undo', run: () => useSeen.getState().unmute(key) },
        });
      },
    },
  });
}

/**
 * Mark a clip played by hand (user 2026-11-17): watched on the TV or phone, which JorGu can't know. Counts like a
 * clip played here (left out of New, Trending and playlists, marked in Search); the toast offers Undo.
 */
export function markClipPlayed(v: VideoItem): void {
  useSeen.getState().markPlayed(v.videoId, v.channel || undefined);
  if (useSettings.getState().youtube.hidePlayed) useQueue.getState().filterAuto((it) => it.videoId !== v.videoId);
  useUi.getState().showToast({
    message: 'toast.markedPlayed',
    params: { title: v.title },
    action: { label: 'toast.undo', run: () => useSeen.getState().unmarkPlayed(v.videoId) },
  });
}

/**
 * Tap a row = play now. "+" = add to the end of the queue. Clips played in JorGu (30 days) or hidden carry a
 * badge (`marks`, on by default); ✓ marks a clip played or not (`playedButton`, with the marks); `hideButton` adds
 * the hide / show-again button (New, Trending).
 */
export function VideoList({ items, onPlay, testId, subtitle, marks = true, hideButton = false, playedButton = marks }: {
  items: VideoItem[];
  onPlay: (index: number) => void;
  testId: string;
  subtitle?: (v: VideoItem) => string;
  marks?: boolean;
  hideButton?: boolean;
  playedButton?: boolean;
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
  const tick = (v: VideoItem, size: string) =>
    playedButton && (
      <button
        type="button"
        aria-pressed={!!played[v.videoId]}
        aria-label={t(played[v.videoId] ? 'library.unmarkPlayed' : 'library.markPlayed')}
        data-testid="lib-mark-played"
        onClick={() => (played[v.videoId] ? useSeen.getState().unmarkPlayed(v.videoId) : markClipPlayed(v))}
        className={`flex shrink-0 items-center justify-center rounded-xl ${size} ${played[v.videoId] ? 'bg-accent text-on-accent' : 'text-text-dim'}`}
      >
        <Icon name="played" size={22} />
      </button>
    );
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
                  <span data-testid="lib-mark" className="absolute left-1 top-1 rounded bg-black/80 px-1.5 text-[11px] font-semibold leading-5 text-white">
                    {t(BADGE[m])}
                  </span>
                )}
                {!!v.duration && (
                  <span data-testid="lib-duration" className="tabular absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-semibold leading-4 text-white">
                    {formatDuration(v.duration)}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{v.title}</span>
                {subtitle ? (
                  <span className="block truncate text-[13px] text-text-dim">{subtitle(v)}</span>
                ) : (
                  <Meta channel={v.channel} age={formatAge(v.publishedAt, lang, now)} />
                )}
              </span>
            </button>
            {/* ✓ beside + over Hide (New, Trending: slimmer columns); else ✓ under + in one column, so the title keeps its width. */}
            {hideButton && tick(v, 'h-12 w-10 self-center')}
            <span className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-label={t('paste.addToQueue')}
                data-testid="lib-add"
                onClick={() => {
                  queueVideos([v]);
                  showToast({ message: 'library.added', params: { title: v.title } });
                }}
                className={`flex items-center justify-center rounded-xl text-text ${hideButton ? 'h-11 w-10' : playedButton ? 'h-11 w-12' : 'h-12 w-12'}`}
              >
                <Icon name="plus" size={22} />
              </button>
              {!hideButton && tick(v, 'h-11 w-12')}
              {hideButton && (
                <button
                  type="button"
                  aria-label={t(m === 'hidden' ? 'library.unhide' : 'library.hide')}
                  data-testid="lib-hide"
                  onClick={() => (m === 'hidden' ? useSeen.getState().unhide(v.videoId) : hideClip(v))}
                  className={`flex h-11 items-center justify-center rounded-xl text-text-dim ${playedButton ? 'w-10' : 'w-12'}`}
                >
                  <Icon name={m === 'hidden' ? 'eye' : 'hide'} size={22} />
                </button>
              )}
            </span>
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
