import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installFrameLoadCounter } from './dev/frameLoads';
import { registerServiceWorker } from './pwa/registerSW';
import './styles/index.css';

installFrameLoadCounter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
