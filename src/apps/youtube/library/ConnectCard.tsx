// Connect / account status (spec §8.1, §8.8). The privacy policy is linked right at the Connect button; tapping
// Connect records consent with a timestamp.
import { useState } from 'react';
import { useUi } from '../../../features/settings/uiStore';
import { useT } from '../../../i18n';
import { Icon } from '../../../shell/Icon';
import { connectAccount, disconnectAccount, useAccount } from '../account/accountStore';

export const PRIVACY_URL = '/privacy';

export function PrivacyLink({ className = '' }: { className?: string }) {
  const t = useT();
  return (
    <a href={PRIVACY_URL} target="_blank" rel="noopener" data-testid="privacy-link" className={`underline ${className}`}>
      {t('account.privacy')}
    </a>
  );
}

export function ConnectCard() {
  const t = useT();
  const status = useAccount((s) => s.status);
  const expired = useAccount((s) => s.expired);
  if (status === 'unavailable') {
    return (
      <p data-testid="account-unavailable" className="rounded-xl bg-bg p-4 text-[14px] text-text-dim">
        {t('account.unavailable')}
      </p>
    );
  }
  if (status === 'unknown') {
    return <p className="rounded-xl bg-bg p-4 text-[14px] text-text-dim">{t('account.checking')}</p>;
  }
  return (
    <div data-testid="connect-card" className="flex flex-col gap-3 rounded-xl bg-bg p-4">
      <div className="flex items-center gap-2 text-[17px] font-semibold">
        <Icon name="youtube" size={24} className="shrink-0" />
        <span className="min-w-0">{expired ? t('account.expiredTitle') : t('account.connectTitle')}</span>
      </div>
      <p className="text-[14px] text-text-dim">{t('account.connectBody')}</p>
      <button
        type="button"
        data-testid="account-connect"
        onClick={connectAccount}
        className="min-h-14 rounded-xl bg-accent px-3 text-[17px] font-semibold text-on-accent"
      >
        {t('account.connect')}
      </button>
      <p className="text-[13px] text-text-dim">
        {t('account.consent')} <PrivacyLink className="text-text" />
      </p>
    </div>
  );
}

/** Settings → YouTube account. */
export function AccountSection() {
  const t = useT();
  const status = useAccount((s) => s.status);
  const profile = useAccount((s) => s.profile);
  const showToast = useUi((s) => s.showToast);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    const ok = await disconnectAccount();
    setBusy(false);
    setConfirm(false);
    showToast({ message: ok ? 'account.disconnected' : 'account.disconnectFailed' });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="account-section" data-status={status}>
      {status === 'connected' && profile ? (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-bg p-3">
            {profile.picture ? (
              <img src={profile.picture} alt="" className="h-10 w-10 shrink-0 rounded-full" />
            ) : (
              <Icon name="user" size={32} className="shrink-0 text-text-dim" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{t('account.connectedAs', { name: profile.name || profile.email })}</div>
              <div className="truncate text-[13px] text-text-dim" data-testid="account-email">
                {profile.email}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="account-disconnect"
            disabled={busy}
            onClick={() => void disconnect()}
            className={`min-h-12 w-full rounded-xl px-3 text-[16px] font-semibold disabled:opacity-50 ${confirm ? 'bg-danger text-bg' : 'bg-bg text-danger'}`}
          >
            {confirm ? t('account.disconnectConfirm') : t('account.disconnect')}
          </button>
        </>
      ) : (
        <ConnectCard />
      )}
      <PrivacyLink className="px-1 py-2 text-[14px] text-text-dim" />
    </div>
  );
}
