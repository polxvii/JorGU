import { type LibraryTab, useUi } from '../../../features/settings/uiStore';
import { useAccount } from '../account/accountStore';

/** Opens the library on `tab`, else the last tab, else "New" when connected or "Link" when not. */
export function openLibrary(tab?: LibraryTab): void {
  const ui = useUi.getState();
  const connected = useAccount.getState().status === 'connected';
  ui.openSheet({ kind: 'library', tab: tab ?? ui.libraryTab ?? (connected ? 'feed' : 'paste') });
}
