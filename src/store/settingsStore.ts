import { create } from 'zustand';
import type { SyncBackendKind, SyncSettings } from '@/types';
import { readSetting, writeSetting } from '@/lib/storage';
import { getSecret, setSecret } from '@/lib/platform';
import { DEFAULT_THEME_ID, isKnownTheme, type ThemeChoice } from '@/lib/themes';

/** Een thema-id uit shared/themes.json, of 'system' om het systeem te volgen. */
export type { ThemeChoice };
export type ViewMode = 'graph' | 'list';

/** Elk soort opslag heeft zijn eigen sleutel, zodat je kunt wisselen zonder opnieuw in te vullen. */
const TOKEN_KEYS: Record<SyncBackendKind, string> = {
  github: 'github-token',
  server: 'server-token',
};

export const DEFAULT_SYNC: SyncSettings = {
  enabled: false,
  backend: 'github',
  owner: '',
  repo: 'pathfinder-data',
  branch: 'main',
  path: 'sync/progress.json',
  pullContent: true,
  serverUrl: '',
  autoSyncMinutes: 10,
};

/**
 * Een thema dat niet meer bestaat (uit een oudere versie, of handmatig aangepast)
 * mag de app niet kleurloos opstarten; dan pakken we het standaardthema.
 */
function readStoredTheme(): ThemeChoice {
  const stored = readSetting<ThemeChoice>('theme', DEFAULT_THEME_ID);
  return isKnownTheme(stored) ? stored : DEFAULT_THEME_ID;
}

interface SettingsState {
  sync: SyncSettings;
  theme: ThemeChoice;
  /** De scanlijnen en het flakkeren van de terminalthema's. */
  crt: boolean;
  /** Het thema dat er nu op staat; bij 'system' is dat licht of donker. */
  resolvedTheme: string;
  viewMode: ViewMode;
  /** Of er voor de gekozen opslag een token bekend is; de waarde zelf blijft erbuiten. */
  hasToken: boolean;
  tokenChecked: boolean;

  init(): Promise<void>;
  setSync(patch: Partial<SyncSettings>): void;
  setTheme(theme: ThemeChoice): void;
  setCrt(on: boolean): void;
  setResolvedTheme(id: string): void;
  setViewMode(mode: ViewMode): void;
  saveToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  refreshToken(): Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  sync: { ...DEFAULT_SYNC, ...readSetting<Partial<SyncSettings>>('sync', {}) },
  theme: readStoredTheme(),
  crt: readSetting<boolean>('crt', true),
  resolvedTheme: DEFAULT_THEME_ID,
  // Op een smal scherm is de lijst standaard bruikbaarder dan de graph.
  viewMode: readSetting<ViewMode>('viewMode', window.innerWidth < 820 ? 'list' : 'graph'),
  hasToken: false,
  tokenChecked: false,

  async init() {
    const token = await getSecret(TOKEN_KEYS[get().sync.backend]);
    set({ hasToken: Boolean(token), tokenChecked: true });
  },

  setSync(patch) {
    const sync = { ...get().sync, ...patch };
    writeSetting('sync', sync);
    set({ sync });
    // Van opslag gewisseld? Dan hoort er een ander token bij.
    if (patch.backend) void get().refreshToken();
  },

  setTheme(theme) {
    writeSetting('theme', theme);
    set({ theme });
  },

  setCrt(crt) {
    writeSetting('crt', crt);
    set({ crt });
  },

  // Alleen voor deze sessie; wat er bewaard wordt is je keuze, niet de uitkomst.
  setResolvedTheme(resolvedTheme) {
    if (resolvedTheme !== get().resolvedTheme) set({ resolvedTheme });
  },

  setViewMode(viewMode) {
    writeSetting('viewMode', viewMode);
    set({ viewMode });
  },

  async saveToken(token) {
    await setSecret(TOKEN_KEYS[get().sync.backend], token.trim() || null);
    set({ hasToken: Boolean(token.trim()) });
  },

  async clearToken() {
    await setSecret(TOKEN_KEYS[get().sync.backend], null);
    set({ hasToken: false });
  },

  async refreshToken() {
    const token = await getSecret(TOKEN_KEYS[get().sync.backend]);
    set({ hasToken: Boolean(token) });
  },
}));

/** Het token van de gekozen opslag, of van een specifieke als je die meegeeft. */
export function readToken(backend?: SyncBackendKind): Promise<string | null> {
  return getSecret(TOKEN_KEYS[backend ?? useSettings.getState().sync.backend]);
}
