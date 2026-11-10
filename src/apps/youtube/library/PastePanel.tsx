// Paste a link (spec §8.3): no quota, no account needed for videos. Playlist links need a connected account.
import { useState } from 'react';
import { useUi } from '../../../features/settings/uiStore';
import { type MessageKey, useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { useAccount } from '../account/accountStore';
import { fillTitles, loadPlaylistItems } from '../account/library';
import { parseYouTubeUrl } from '../parseYouTubeUrl';
import { playList, playVideo, queueVideos } from '../playActions';

export function PastePanel() {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const status = useAccount((s) => s.status);
  const [value, setValue] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const canReadClipboard = typeof navigator.clipboard?.readText === 'function';

  const submit = (mode: 'now' | 'queue') => {
    const parsed = parseYouTubeUrl(value);
    if (!parsed) return setError('paste.invalid');
    if (parsed.videoId) {
      const v = { videoId: parsed.videoId, start: parsed.start };
      if (mode === 'queue') queueVideos([v]);
      else playVideo(v);
      void fillTitles([parsed.videoId]);
      return close();
    }
    if (!parsed.playlistId || status !== 'connected') return setError('paste.playlistLater');
    setBusy(true);
    loadPlaylistItems(parsed.playlistId).then(
      (r) => {
        setBusy(false);
        if (r.data.length === 0) return setError('library.empty');
        if (mode === 'queue') queueVideos(r.data);
        else playList(r.data);
        close();
      },
      () => {
        setBusy(false);
        setError('library.error.generic');
      },
    );
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text.trim());
      setError(null);
    } catch {
      /* permission denied: the user types or long-presses to paste */
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-1" data-testid="paste-panel">
      <div className="flex gap-2">
        <input
          data-testid="paste-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          placeholder={t('paste.placeholder')}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit('now')}
          className="min-h-14 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[16px] text-text select-text"
        />
        {canReadClipboard && (
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="flex min-h-14 shrink-0 items-center gap-1 rounded-xl bg-bg px-3 text-[15px] font-semibold text-text"
          >
            <Icon name="paste" size={22} />
            {t('paste.fromClipboard')}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" data-testid="paste-error" className="text-[15px] text-warn">
          {t(error)}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="paste-play"
          disabled={busy}
          onClick={() => submit('now')}
          className="min-h-14 flex-1 rounded-xl bg-accent px-3 text-[17px] font-semibold text-on-accent disabled:opacity-50"
        >
          {busy ? t('library.loading') : t('paste.playNow')}
        </button>
        <button
          type="button"
          data-testid="paste-queue"
          disabled={busy}
          onClick={() => submit('queue')}
          className="min-h-14 flex-1 rounded-xl bg-bg px-3 text-[17px] font-semibold text-text disabled:opacity-50"
        >
          {t('paste.addToQueue')}
        </button>
      </div>
    </div>
  );
}
