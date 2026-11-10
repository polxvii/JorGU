// Startup: purge old cache entries, handle the OAuth return (?yt=connected|denied|error), check the account.
import { useUi } from '../../../features/settings/uiStore';
import { refreshAccount, useAccount } from './accountStore';
import { purgeOld } from './cache';
import { fillTitles, untitledQueueIds } from './library';

export function installAccount(): void {
  void purgeOld();

  const url = new URL(window.location.href);
  const result = url.searchParams.get('yt');
  if (result) {
    const reason = url.searchParams.get('reason') ?? 'unknown';
    url.searchParams.delete('yt');
    url.searchParams.delete('reason');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    const ui = useUi.getState();
    if (result === 'connected') {
      useAccount.setState({ expired: false });
      ui.showToast({ message: 'account.connectedToast' });
      ui.openSheet({ kind: 'library', tab: 'feed' });
    } else if (result === 'denied') {
      ui.showToast({ message: 'account.denied' });
    } else {
      ui.showToast({ message: 'account.failed', params: { reason } });
    }
  }

  void refreshAccount().then((status) => {
    if (status === 'connected') void fillTitles(untitledQueueIds());
  });
}
