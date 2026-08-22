import { create } from 'zustand';
import { APP_VERSION, IS_ANDROID, desktop, openExternal } from '@/lib/platform';
import { getLatestRelease } from '@/lib/github';
import { readToken } from './settingsStore';

/**
 * Bijwerken vanuit de app zelf.
 *
 * - **Windows**: electron-updater haalt de nieuwe versie op uit de GitHub Releases
 *   en installeert hem stil bij het herstarten. Je krijgt dus geen setup-venster
 *   te zien; je klikt op de knop en de app komt bijgewerkt terug.
 * - **Android**: er is geen Play Store, dus de app zet de APK-download klaar.
 *   Het installeren zelf doet Android, en dat mag een app niet overslaan.
 *
 * De status staat in een store en niet in een hook, zodat de knop in de balk en
 * het scherm Instellingen hetzelfde laten zien.
 */

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  /** Er staat nog geen enkele release in de repository waar deze build naar kijkt. */
  | { kind: 'norelease' }
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

/** Een 404 op de release-repo betekent: daar staat nog niets, niet dat je bij bent. */
function looksLikeMissingRelease(message: string): boolean {
  return /404|not found|cannot find|no published versions/i.test(message);
}

interface UpdateStore {
  state: UpdateState;
  /** Of de controle bij het opstarten al is gedaan. */
  checkedOnce: boolean;

  listen(): () => void;
  check(options?: { silent?: boolean }): Promise<void>;
  install(): void;
  dismiss(): void;
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  state: { kind: 'idle' },
  checkedOnce: false,

  /** Luistert naar wat het hoofdproces van Electron meldt. */
  listen() {
    if (!desktop) return () => undefined;
    return desktop.onUpdateEvent((event) => {
      switch (event.type) {
        case 'checking':
          set({ state: { kind: 'checking' } });
          break;
        case 'available':
          set({
            state: { kind: 'available', version: event.info.version, notes: event.info.notes },
          });
          break;
        case 'none':
          set({ state: { kind: 'none' }, checkedOnce: true });
          break;
        case 'progress':
          set({ state: { kind: 'downloading', percent: Math.round(event.percent) } });
          break;
        case 'ready':
          set({ state: { kind: 'ready', version: event.info.version }, checkedOnce: true });
          break;
        case 'error':
          set({
            state: looksLikeMissingRelease(event.message)
              ? { kind: 'norelease' }
              : { kind: 'error', message: event.message },
            checkedOnce: true,
          });
          break;
      }
    });
  },

  async check(options) {
    // Een controle die al loopt of een download die bezig is niet onderbreken.
    const current = get().state;
    if (current.kind === 'checking' || current.kind === 'downloading') return;
    if (options?.silent && (current.kind === 'ready' || current.kind === 'available')) return;

    set({ state: { kind: 'checking' } });

    if (desktop) {
      try {
        await desktop.checkForUpdates();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Controleren mislukt.';
        set({
          state: looksLikeMissingRelease(message) ? { kind: 'norelease' } : { kind: 'error', message },
          checkedOnce: true,
        });
      }
      return;
    }

    if (!RELEASE_OWNER || !RELEASE_REPO) {
      set({ state: { kind: 'error', message: 'Deze build heeft geen release-repository.' } });
      return;
    }

    // Een prive repository vraagt om het token dat je bij de sync hebt ingesteld;
    // bij een publieke repository is dat niet nodig.
    const token = RELEASE_IS_PRIVATE ? await readToken('github') : null;
    if (RELEASE_IS_PRIVATE && !token) {
      set({
        state: { kind: 'error', message: 'Stel eerst je GitHub-token in bij Synchronisatie.' },
      });
      return;
    }

    try {
      const release = await getLatestRelease(token, RELEASE_OWNER, RELEASE_REPO);
      if (!release) {
        set({ state: { kind: 'norelease' }, checkedOnce: true });
        return;
      }
      if (compareVersions(release.tag, APP_VERSION) <= 0) {
        set({ state: { kind: 'none' }, checkedOnce: true });
        return;
      }
      const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
      set({
        state: {
          kind: 'available',
          version: release.tag.replace(/^v/i, ''),
          notes: release.notes,
          url: IS_ANDROID ? apk?.url : undefined,
        },
        checkedOnce: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Controleren mislukt.';
      set({
        state: looksLikeMissingRelease(message) ? { kind: 'norelease' } : { kind: 'error', message },
        checkedOnce: true,
      });
    }
  },

  install() {
    const state = get().state;
    if (desktop) {
      void desktop.installUpdate();
      return;
    }
    if (state.kind === 'available' && state.url) openExternal(state.url);
  },

  dismiss() {
    set({ state: { kind: 'idle' } });
  },
}));
