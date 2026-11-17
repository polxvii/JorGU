import { useCallback, useState } from 'react';
import type { PlaylistItem, VideoItem } from '../../../../shared/ytTypes';
import { useSettings } from '../../../features/settings/settingsStore';
import { useUi } from '../../../features/settings/uiStore';
import { useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { loadPlaylistItems, loadPlaylists } from '../account/library';
import { playList } from '../playActions';
import { skipReason, useSeen } from '../seenStore';
import { useLoad } from './useLoad';
import { LoadFrame, Thumb, VideoList } from './VideoList';

function PlaylistIndex({ onOpen }: { onOpen: (p: PlaylistItem) => void }) {
  const t = useT();
  const state = useLoad(loadPlaylists);
  return (
    <LoadFrame state={state} empty="library.noPlaylists">
      {(items) => (
        <ul className="flex flex-col gap-1" data-testid="lib-playlists">
          {items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-playlist-id={p.id}
                onClick={() => onOpen(p)}
                className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-bg p-2 text-left"
              >
                <Thumb src={p.thumb} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{p.title}</span>
                  <span className="block text-[13px] text-text-dim">{t('library.videos', { count: p.count })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </LoadFrame>
  );
}

/**
 * A playlist's clips. Clips played in JorGu, hidden, or from a channel turned off are left out like in New (user
 * 2026-11-17; Settings → Hide clips already played); "N hidden · Show" brings them back. Play all and a tap play the
 * list as shown.
 */
function PlaylistDetail({ playlist, onBack }: { playlist: PlaylistItem; onBack: () => void }) {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const hidePlayed = useSettings((s) => s.youtube.hidePlayed);
  const played = useSeen((s) => s.played);
  const hidden = useSeen((s) => s.hidden);
  const muted = useSeen((s) => s.muted);
  const [showAll, setShowAll] = useState(false);
  const load = useCallback((force: boolean) => loadPlaylistItems(playlist.id, force), [playlist.id]);
  const state = useLoad(load);
  const skip = (v: VideoItem) => !!skipReason(v, { played, hidden, muted }, hidePlayed);
  const items = (state.data ?? []).filter((v) => showAll || !skip(v));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('library.back')}
          data-testid="lib-back"
          onClick={onBack}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg text-text"
        >
          <Icon name="back" size={22} />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{playlist.title}</h3>
      </div>
      <button
        type="button"
        data-testid="lib-play-all"
        disabled={items.length === 0}
        onClick={() => {
          playList(items);
          close();
        }}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-[16px] font-semibold text-on-accent disabled:opacity-50"
      >
        <Icon name="play" size={22} />
        {t('library.playAll')}
      </button>
      <LoadFrame state={state} empty="library.empty">
        {(all) => {
          const list = all.filter((v) => showAll || !skip(v));
          const off = all.filter(skip).length;
          return (
            <>
              {list.length ? (
                <VideoList
                  testId="lib-playlist-items"
                  items={list}
                  onPlay={(i) => {
                    playList(list, i);
                    close();
                  }}
                />
              ) : (
                <p className="py-6 text-center text-text-dim" data-testid="lib-playlist-all-hidden">
                  {t('library.allHidden')}
                </p>
              )}
              {off > 0 && (
                <button
                  type="button"
                  data-testid="lib-playlist-items-show-hidden"
                  onClick={() => setShowAll(!showAll)}
                  className="min-h-12 rounded-xl bg-bg px-3 text-[14px] font-semibold text-text-dim"
                >
                  {showAll ? t('library.hideAgain') : t('library.hiddenCount', { count: off })}
                </button>
              )}
            </>
          );
        }}
      </LoadFrame>
    </div>
  );
}

export function PlaylistsPanel() {
  const [open, setOpen] = useState<PlaylistItem | null>(null);
  return open ? <PlaylistDetail key={open.id} playlist={open} onBack={() => setOpen(null)} /> : <PlaylistIndex onOpen={setOpen} />;
}
