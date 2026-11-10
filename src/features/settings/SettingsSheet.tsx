import { type ReactNode, useState } from 'react';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Sheet } from '../../shell/Sheet';
import type { Rect } from '../../shell/geometry';
import { THEMES, THEME_IDS } from '../../theme/themes';
import { useSettings } from './settingsStore';
import type { ThemeId } from './types';
import { setSpeed } from '../../apps/youtube/player';
import { SPEED_PRESETS, formatSpeed } from '../../apps/youtube/speed';
import { AccountSection } from '../../apps/youtube/library/ConnectCard';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-dim">{title}</h3>
      {children}
    </section>
  );
}

function Segmented<V extends string>({ value, options, onChange, testId }: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  testId: string;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-value={o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-12 flex-1 rounded-xl px-3 text-[16px] font-semibold ${
            value === o.value ? 'bg-accent text-on-accent' : 'bg-bg text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsSheet({ rect }: { rect: Rect }) {
  const t = useT();
  const s = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Sheet rect={rect} title={t('settings.title')} testId="settings-sheet">
      <Section title={t('settings.language')}>
        <Segmented
          testId="setting-language"
          value={s.language}
          onChange={s.setLanguage}
          options={[
            { value: 'en', label: t('settings.languageEn') },
            { value: 'th', label: t('settings.languageTh') },
          ]}
        />
      </Section>

      <Section title={t('settings.driverSide')}>
        <Segmented
          testId="setting-driver-side"
          value={s.layout.driverSide}
          onChange={s.setDriverSide}
          options={[
            { value: 'right', label: t('settings.driverRight') },
            { value: 'left', label: t('settings.driverLeft') },
          ]}
        />
      </Section>

      <Section title={t('settings.splitDirection')}>
        <Segmented
          testId="setting-direction"
          value={s.layout.direction}
          onChange={s.setDirection}
          options={[
            { value: 'auto', label: t('settings.directionAuto') },
            { value: 'side', label: t('settings.directionSide') },
            { value: 'stacked', label: t('settings.directionStacked') },
          ]}
        />
        <p className="mt-2 px-1 text-[13px] text-text-dim">{t('settings.directionHint')}</p>
      </Section>

      <Section title={t('settings.theme')}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" data-testid="setting-theme">
          {THEME_IDS.map((id: ThemeId) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={s.themeId === id}
              data-value={id}
              onClick={() => s.setTheme(id)}
              className={`flex min-h-14 items-center gap-2 rounded-xl px-3 text-left text-[14px] font-semibold ${
                s.themeId === id ? 'ring-2 ring-accent' : ''
              }`}
              style={{ background: THEMES[id].bg, color: THEMES[id].text }}
            >
              <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: THEMES[id].accent }} />
              <span className="min-w-0 truncate">{t(`theme.${id}` as MessageKey)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.nightMode')}>
        <Segmented
          testId="setting-night"
          value={s.nightMode.auto ? 'auto' : 'off'}
          onChange={(v) => s.setNightMode({ auto: v === 'auto' })}
          options={[
            { value: 'auto', label: t('settings.nightAuto') },
            { value: 'off', label: t('settings.nightOff') },
          ]}
        />
        {s.nightMode.auto && (
          <div className="mt-2 flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[13px] text-text-dim">
              {t('settings.nightStart')}
              <input
                type="time"
                value={s.nightMode.start}
                onChange={(e) => s.setNightMode({ start: e.target.value })}
                className="min-h-12 rounded-xl bg-bg px-3 text-[16px] text-text"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[13px] text-text-dim">
              {t('settings.nightEnd')}
              <input
                type="time"
                value={s.nightMode.end}
                onChange={(e) => s.setNightMode({ end: e.target.value })}
                className="min-h-12 rounded-xl bg-bg px-3 text-[16px] text-text"
              />
            </label>
          </div>
        )}
      </Section>

      <Section title={t('settings.account')}>
        <AccountSection />
      </Section>

      <Section title={`${t('settings.youtube')} · ${t('settings.playbackSpeed')}`}>
        <Segmented
          testId="setting-speed"
          value={String(s.youtube.playbackRate)}
          onChange={(v) => setSpeed(Number(v))}
          options={SPEED_PRESETS.map((r) => ({ value: String(r), label: formatSpeed(r) }))}
        />
      </Section>

      <Section title={t('settings.miniPlayer')}>
        <Segmented
          testId="setting-mini-size"
          value={s.youtube.miniPlayerSize}
          onChange={s.setMiniPlayerSize}
          options={[
            { value: '356x200', label: '356 × 200' },
            { value: '480x270', label: '480 × 270' },
          ]}
        />
      </Section>

      <Section title={t('settings.reset')}>
        <button
          type="button"
          data-testid="setting-reset"
          onClick={() => {
            if (confirmReset) {
              s.reset();
              setConfirmReset(false);
            } else {
              setConfirmReset(true);
            }
          }}
          className={`min-h-12 w-full rounded-xl px-3 text-[16px] font-semibold ${
            confirmReset ? 'bg-danger text-bg' : 'bg-bg text-danger'
          }`}
        >
          {confirmReset ? t('settings.resetConfirm') : t('settings.reset')}
        </button>
        <p className="mt-4 px-1 text-[12px] text-text-dim">{t('settings.version', { version: __APP_VERSION__ })}</p>
      </Section>
    </Sheet>
  );
}
