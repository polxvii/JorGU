import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAccount } from './apps/youtube/account/accountInit';
import { installMediaKeys } from './apps/youtube/mediaKeys';
import { installFrameLoadCounter } from './dev/frameLoads';
import { installTestHooks } from './dev/testHooks';
import { registerServiceWorker } from './pwa/registerSW';
import './styles/index.css';

installFrameLoadCounter();
installTestHooks();
installMediaKeys();
installAccount();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
