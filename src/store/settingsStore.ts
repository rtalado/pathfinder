import { create } from 'zustand';
import type { SyncSettings } from '@/types';
import { readSetting, writeSetting } from '@/lib/storage';
import { getSecret, setSecret } from '@/lib/platform';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type ViewMode = 'graph' | 'list';

const TOKEN_KEY = 'github-token';

export const DEFAULT_SYNC: SyncSettings = {
  enabled: false,
  owner: '',
  repo: 'learnpath-data',
  branch: 'main',
  path: 'sync/progress.json',
  pullContent: true,
  autoSyncMinutes: 10,
};

interface SettingsState {
  sync: SyncSettings;
  theme: ThemeChoice;
  viewMode: ViewMode;
  /** Alleen of er een token is; de waarde zelf blijft buiten de store. */
  hasToken: boolean;
  tokenChecked: boolean;

  init(): Promise<void>;
  setSync(patch: Partial<SyncSettings>): void;
  setTheme(theme: ThemeChoice): void;
  setViewMode(mode: ViewMode): void;
  saveToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  sync: { ...DEFAULT_SYNC, ...readSetting<Partial<SyncSettings>>('sync', {}) },
  theme: readSetting<ThemeChoice>('theme', 'dark'),
  // Op een smal scherm is de lijst standaard bruikbaarder dan de graph.
  viewMode: readSetting<ViewMode>('viewMode', window.innerWidth < 820 ? 'list' : 'graph'),
  hasToken: false,
  tokenChecked: false,

  async init() {
    const token = await getSecret(TOKEN_KEY);
    set({ hasToken: Boolean(token), tokenChecked: true });
  },

  setSync(patch) {
    const sync = { ...get().sync, ...patch };
    writeSetting('sync', sync);
    set({ sync });
  },

  setTheme(theme) {
    writeSetting('theme', theme);
    set({ theme });
  },

  setViewMode(viewMode) {
    writeSetting('viewMode', viewMode);
    set({ viewMode });
  },

  async saveToken(token) {
    await setSecret(TOKEN_KEY, token.trim() || null);
    set({ hasToken: Boolean(token.trim()) });
  },

  async clearToken() {
    await setSecret(TOKEN_KEY, null);
    set({ hasToken: false });
  },
}));

export function readToken(): Promise<string | null> {
  return getSecret(TOKEN_KEY);
}
