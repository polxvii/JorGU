// Paste a link (spec §8.3): no quota, no account needed.
import { useState } from 'react';
import { useUi } from '../../features/settings/uiStore';
import { type MessageKey, useT } from '../../i18n';
import { Icon } from '../../shell/Icon';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { parseYouTubeUrl } from './parseYouTubeUrl';
import { makeItem, useQueue } from './queueStore';
import { playIndex } from './player';

export function PasteLinkSheet({ rect }: { rect: Rect }) {
  const t = useT();
  const close = useUi((s) => s.closeSheet);
  const [value, setValue] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const canReadClipboard = typeof navigator.clipboard?.readText === 'function';

  const submit = (mode: 'now' | 'queue') => {
    const parsed = parseYouTubeUrl(value);
    if (!parsed) return setError('paste.invalid');
    if (!parsed.videoId) return setError('paste.playlistLater');
    const item = makeItem(parsed.videoId, { start: parsed.start });
    const q = useQueue.getState();
    if (mode === 'queue') {
      q.addToEnd([item]);
    } else if (q.items.length === 0) {
      q.playNow([item]);
      playIndex(0, { auto: false });
    } else {
      q.addNext(item);
      playIndex(useQueue.getState().index + 1, { auto: false });
    }
    close();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text.trim());
      setError(null);
    } catch {
      /* permission denied: user types or long-presses to paste */
    }
  };

  return (
    <Sheet rect={rect} title={t('paste.title')} testId="paste-sheet">
      <div className="flex flex-col gap-3 pt-1">
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
            onClick={() => submit('now')}
            className="min-h-14 flex-1 rounded-xl bg-accent px-3 text-[17px] font-semibold text-on-accent"
          >
            {t('paste.playNow')}
          </button>
          <button
            type="button"
            data-testid="paste-queue"
            onClick={() => submit('queue')}
            className="min-h-14 flex-1 rounded-xl bg-bg px-3 text-[17px] font-semibold text-text"
          >
            {t('paste.addToQueue')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
