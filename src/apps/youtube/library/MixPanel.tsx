// Mix tab (user 2026-11-15): YouTube's Mix (related clips) of the songs played most in JorGu and of liked videos.
// A tap plays the song, then its Mix keeps going (player.ts). Works without an account; liked videos need one.
import { useEffect, useState } from 'react';
import type { VideoItem } from '../../../../shared/ytTypes';
import { useUi } from '../../../features/settings/uiStore';
import { useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { useAccount } from '../account/accountStore';
import { loadLiked } from '../account/library';
import { useHistory } from '../historyStore';
import { playMix } from '../playActions';
import { useSeen } from '../seenStore';
import { mixSeeds } from './mixSeeds';
import { Thumb } from './VideoList';

interface Seed {
  videoId: string;
  title: string;
  channel: string;
  thumb: string;
  plays?: number;
}

function MixList({ seeds, testId }: { seeds: Seed[]; testId: string }) {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  return (
    <ul className="flex flex-col gap-1" data-testid={testId}>
      {seeds.map((s) => (
        <li key={s.videoId} data-video-id={s.videoId} className="rounded-xl bg-bg">
          <button
            type="button"
            onClick={() => {
              playMix(s);
              close();
            }}
            className="flex min-h-16 w-full min-w-0 items-center gap-3 p-2 text-left"
          >
            <span className="relative flex shrink-0">
              <Thumb src={s.thumb} />
              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white">
                <Icon name="mix" size={18} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{t('mix.card', { title: s.title })}</span>
              <span className="block truncate text-[13px] text-text-dim">
                {[s.channel, s.plays && s.plays > 1 ? t('mix.plays', { count: s.plays }) : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MixPanel() {
  const t = useT();
  const entries = useHistory((s) => s.entries);
  const hidden = useSeen((s) => s.hidden);
  const status = useAccount((s) => s.status);
  const [liked, setLiked] = useState<VideoItem[]>([]);
  useEffect(() => {
    if (status !== 'connected') return;
    let live = true;
    loadLiked()
      .then((r) => live && setLiked(r.data ?? []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status]);

  const played: Seed[] = mixSeeds(entries, hidden).map((e) => ({
    videoId: e.videoId,
    title: e.title ?? '',
    channel: e.channel ?? '',
    thumb: `https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg`,
    plays: e.plays,
  }));
  const fromLiked: Seed[] = liked.filter((v) => !hidden[v.videoId] && !played.some((p) => p.videoId === v.videoId)).slice(0, 6);

  return (
    <div className="flex flex-col gap-3" data-testid="lib-mix">
      <p className="px-1 text-[14px] text-text-dim">{t('mix.hint')}</p>
      {played.length === 0 && fromLiked.length === 0 && (
        <p className="px-1 py-4 text-center text-text-dim" data-testid="lib-mix-empty">
          {t('mix.empty')}
        </p>
      )}
      {played.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('mix.fromPlayed')}</h3>
          <MixList seeds={played} testId="lib-mix-played" />
        </section>
      )}
      {fromLiked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{t('mix.fromLiked')}</h3>
          <MixList seeds={fromLiked} testId="lib-mix-liked" />
        </section>
      )}
    </div>
  );
}
