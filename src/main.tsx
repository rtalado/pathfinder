import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { desktop } from './lib/platform';
import { RELEASE_IS_PRIVATE, useUpdate } from './store/updateStore';
import { useProgress } from './store/progressStore';
import { readToken, useSettings } from './store/settingsStore';
import { applyTheme, findTheme } from './lib/themes';
import './index.css';

/** Zet het thema op <html>, zodat de CSS-tokens meteen kloppen. */
function useTheme() {
  const theme = useSettings((store) => store.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      // "Volg het systeem" kiest tussen de twee neutrale thema's; een eigen keuze
      // blijft staan, ook als het systeem intussen naar licht overschakelt.
      const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
      applyTheme(findTheme(resolved));
      useSettings.getState().setResolvedTheme(resolved);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function Bootstrap() {
  useTheme();

  useEffect(() => {
    const progress = useProgress.getState();
    const settings = useSettings.getState();
    const stopListening = useUpdate.getState().listen();

    void (async () => {
      await settings.init();
      await progress.init();

      const { sync } = useSettings.getState();
      if (sync.enabled) {
        await progress.syncNow({ silent: true });
        progress.startAutoSync();
      }

      // Bij een prive release-repository heeft de updater een token nodig. Waar de
      // updates vandaan komen staat vast in de build; dit geeft alleen de sleutel.
      if (desktop && RELEASE_IS_PRIVATE) {
        const token = await readToken('github');
        if (token) void desktop.configureUpdater(token);
      }

      // Buiten Electron kijkt niemand vanzelf; daar doet de app het zelf.
      if (!desktop) void useUpdate.getState().check({ silent: true });
    })();

    // Terugkomen in het venster is het moment waarop het andere apparaat iets
    // gewijzigd kan hebben; daarom dan meteen ophalen.
    const onFocus = () => {
      if (useSettings.getState().sync.enabled) void useProgress.getState().syncNow({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      useProgress.getState().stopAutoSync();
      stopListening();
    };
  }, []);

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Bootstrap />
    </HashRouter>
  </StrictMode>
);
