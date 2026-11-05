import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/latin-400.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initApp } from './db/repo';
import { STRINGS } from './i18n/strings';

const root = createRoot(document.getElementById('root')!);

initApp()
  .then(() => {
    // Ask the browser not to evict local data (best effort; installed PWAs are usually granted).
    void navigator.storage?.persist?.().catch(() => undefined);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    root.render(
      <div className="boot boot-error" role="alert">
        <p>{STRINGS.ar.errors.initFailed}</p>
        <p dir="ltr">{STRINGS.en.errors.initFailed}</p>
        <pre dir="ltr">{String(err)}</pre>
      </div>,
    );
  });
