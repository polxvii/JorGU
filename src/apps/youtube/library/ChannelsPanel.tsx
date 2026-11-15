// Channels in New (user 2026-11-15: "lots of things I'm not interested in"): every subscribed channel with a Shown /
// Off switch. Off = left out of New (the Worker skips it, so another channel takes its place), Trending and Mix.
// Channels turned off come first (also ones hidden from Trending that aren't subscriptions, so a channel hidden by
// mistake can always be turned back on), then the ones played most, with their play count.
import { useState } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { loadSubscriptions } from '../account/library';
import { channelPlays, useSeen } from '../seenStore';
import { useLoad } from './useLoad';
import { LoadFrame } from './VideoList';

export function ChannelsPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const state = useLoad(loadSubscriptions);
  const muted = useSeen((s) => s.muted);
  const plays = channelPlays(useSeen((s) => s.played));
  const { mute, unmute } = useSeen.getState();
  const [offAtOpen] = useState(() => Object.fromEntries(Object.entries(useSeen.getState().muted).map(([k, m]) => [k, m.title])));
  return (
    <div className="flex flex-col gap-2" data-testid="lib-channels-panel">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="lib-channels-back"
          onClick={onBack}
          className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl bg-bg pl-2 pr-3 text-[15px] font-semibold text-text"
        >
          <Icon name="back" size={20} />
          {t('library.back')}
        </button>
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{t('library.channelsTitle')}</h3>
      </div>
      <p className="px-1 text-[13px] text-text-dim">{t('library.channelsHint')}</p>
      <LoadFrame state={state} empty="library.empty">
        {(subs) => {
          // Hidden channels that aren't subscriptions (from Trending or a Mix): listed too, keyed as they were hidden.
          // Order and rows come from when the page opened, so a tap never moves or removes a row.
          const known = { ...offAtOpen, ...Object.fromEntries(Object.entries(muted).map(([k, m]) => [k, m.title])) };
          const extra = Object.entries(known)
            .filter(([key, title]) => !subs.some((c) => c.channelId === key || c.title === key || c.title === title))
            .map(([key, title]) => ({ channelId: key, title, thumb: '' }));
          const wasOff = (c: { channelId: string; title: string }) => c.channelId in offAtOpen || c.title in offAtOpen;
          const isOff = (c: { channelId: string; title: string }) => !!muted[c.channelId] || !!muted[c.title];
          const list = [...extra, ...subs].sort(
            (a, b) =>
              Number(wasOff(b)) - Number(wasOff(a)) || (plays.get(b.title) ?? 0) - (plays.get(a.title) ?? 0) || a.title.localeCompare(b.title),
          );
          return (
            <ul className="flex flex-col gap-1" data-testid="lib-channel-list">
              {list.map((c) => {
                const off = isOff(c);
                const n = plays.get(c.title) ?? 0;
                return (
                  <li key={c.channelId} data-channel-id={c.channelId} data-off={off ? '1' : '0'} className="flex items-center gap-3 rounded-xl bg-bg p-2">
                    {c.thumb ? (
                      <img src={c.thumb} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-full bg-surface object-cover" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded-full bg-surface" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-semibold ${off ? 'text-text-dim line-through' : ''}`}>{c.title}</span>
                      {n > 0 && <span className="block text-[13px] text-text-dim">{t('library.channelPlays', { count: n })}</span>}
                    </span>
                    <button
                      type="button"
                      aria-pressed={!off}
                      data-testid="lib-channel-toggle"
                      onClick={() => {
                        if (!off) {
                          mute(c.channelId, c.title);
                          return;
                        }
                        unmute(c.channelId);
                        unmute(c.title);
                      }}
                      className={`min-h-11 min-w-20 shrink-0 rounded-xl px-3 text-[14px] font-semibold ${off ? 'bg-surface text-text-dim' : 'bg-accent text-on-accent'}`}
                    >
                      {t(off ? 'library.channelOff' : 'library.channelOn')}
                    </button>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </LoadFrame>
    </div>
  );
}
