import type { ReactNode } from 'react';
import type { VideoItem } from '../../../../shared/ytTypes';
import { useUi } from '../../../features/settings/uiStore';
import { type MessageKey, useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { queueVideos } from '../playActions';
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

/** Tap a row = play now. "+" = add to the end of the queue. */
export function VideoList({ items, onPlay, testId, subtitle }: {
  items: VideoItem[];
  onPlay: (index: number) => void;
  testId: string;
  subtitle?: (v: VideoItem) => string;
}) {
  const t = useT();
  const showToast = useUi((s) => s.showToast);
  return (
    <ul className="flex flex-col gap-1" data-testid={testId}>
      {items.map((v, i) => (
        <li key={`${v.videoId}-${i}`} data-video-id={v.videoId} className="flex items-center rounded-xl bg-bg">
          <button type="button" onClick={() => onPlay(i)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-2 text-left">
            <Thumb src={v.thumb} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{v.title}</span>
              <span className="block truncate text-[13px] text-text-dim">
                {subtitle ? subtitle(v) : [v.channel, v.duration ? formatDuration(v.duration) : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
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
      ))}
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
