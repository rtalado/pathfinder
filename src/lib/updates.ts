import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION, IS_ANDROID, desktop, openExternal } from './platform';
import { getLatestRelease } from './github';
import { readToken } from '@/store/settingsStore';

/**
 * Bijwerken verloopt per platform anders:
 *
 * - Desktop: electron-updater kijkt naar de GitHub Releases, downloadt op de
 *   achtergrond en installeert bij het afsluiten.
 * - Android: er is geen Play Store, dus de app kijkt zelf of er een nieuwere
 *   release is en zet de APK-download klaar. Installeren doe je zelf, dat is
 *   een keuze van Android en niet iets wat de app mag overslaan.
 *
 * De releases komen uit de repository die bij de build hoort, niet uit de
 * repository waarin jij je voortgang bewaart. Dat scheelt: bij de publieke versie
 * halen alle gebruikers hun updates uit dezelfde repo terwijl ieder zijn eigen
 * prive repo voor zijn gegevens gebruikt.
 */

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; version: string; notes?: string; url?: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

const [RELEASE_OWNER, RELEASE_REPO] = __RELEASE_REPO__.split('/');

export const RELEASE_SOURCE = __RELEASE_REPO__;
export const RELEASE_IS_PRIVATE = __RELEASE_PRIVATE__;

/** Vergelijkt versies als 1.2.10 > 1.2.9; geeft 0 als ze gelijk zijn. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split(/[.\-+]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isNaN(part) ? 0 : part));

  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  useEffect(() => {
    if (!desktop) return;
    return desktop.onUpdateEvent((event) => {
      switch (event.type) {
        case 'checking':
          setState({ kind: 'checking' });
          break;
        case 'available':
          setState({ kind: 'available', version: event.info.version, notes: event.info.notes });
          break;
        case 'none':
          setState({ kind: 'none' });
          break;
        case 'progress':
          setState({ kind: 'downloading', percent: Math.round(event.percent) });
          break;
        case 'ready':
          setState({ kind: 'ready', version: event.info.version });
          break;
        case 'error':
          setState({ kind: 'error', message: event.message });
          break;
      }
    });
  }, []);

  const check = useCallback(async () => {
    setState({ kind: 'checking' });

    if (desktop) {
      try {
        await desktop.checkForUpdates();
      } catch (error) {
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Controleren mislukt.',
        });
      }
      return;
    }

    // Android en web: zelf bij GitHub kijken.
    if (!RELEASE_OWNER || !RELEASE_REPO) {
      setState({ kind: 'error', message: 'Deze build heeft geen release-repository.' });
      return;
    }

    // Een prive repository vraagt om het token dat je bij de sync hebt ingesteld;
    // bij een publieke repository is dat niet nodig.
    const token = RELEASE_IS_PRIVATE ? await readToken() : null;
    if (RELEASE_IS_PRIVATE && !token) {
      setState({ kind: 'error', message: 'Stel eerst je GitHub-token in bij Synchronisatie.' });
      return;
    }

    try {
      const release = await getLatestRelease(token, RELEASE_OWNER, RELEASE_REPO);
      if (!release || compareVersions(release.tag, APP_VERSION) <= 0) {
        setState({ kind: 'none' });
        return;
      }
      const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
      setState({
        kind: 'available',
        version: release.tag.replace(/^v/i, ''),
        notes: release.notes,
        url: IS_ANDROID ? apk?.url : undefined,
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Controleren mislukt.',
      });
    }
  }, []);

  const install = useCallback(() => {
    if (desktop) {
      void desktop.installUpdate();
      return;
    }
    if (state.kind === 'available' && state.url) openExternal(state.url);
  }, [state]);

  return { state, check, install };
}
