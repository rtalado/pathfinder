/**
 * Alles wat per platform verschilt zit hier achter een gemeenschappelijke API,
 * zodat de rest van de app niet hoeft te weten of hij in Electron, in de APK of
 * in een browser draait.
 */

export type PlatformKind = 'desktop' | 'android' | 'web';

export interface UpdateInfo {
  version: string;
  notes?: string;
  url?: string;
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'ready'; info: UpdateInfo }
  | { type: 'error'; message: string };

/** Wordt door electron/preload.cjs op window gezet. */
interface DesktopBridge {
  platform: 'desktop';
  appVersion: string;
  secretGet(key: string): Promise<string | null>;
  secretSet(key: string, value: string | null): Promise<void>;
  openExternal(url: string): Promise<void>;
  openPath(filePath: string): Promise<string>;
  showInFolder(filePath: string): Promise<void>;
  /** Geeft het GitHub-token door, anders kan de updater een prive repo niet lezen. */
  configureUpdater(token: string): Promise<boolean>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateEvent(callback: (event: UpdateEvent) => void): () => void;
}

declare global {
  interface Window {
    learnpath?: DesktopBridge;
    Capacitor?: { isNativePlatform?: boolean; getPlatform?: () => string };
  }
}

export const desktop = typeof window !== 'undefined' ? window.learnpath : undefined;

export function platformKind(): PlatformKind {
  if (desktop) return 'desktop';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform) return 'android';
  return 'web';
}

export const IS_DESKTOP = platformKind() === 'desktop';
export const IS_ANDROID = platformKind() === 'android';

/** Versie uit package.json, door Vite ingebakken (zie define in vite.config/env). */
export const APP_VERSION: string = desktop?.appVersion ?? __APP_VERSION__;

/**
 * Op de desktop gaat het token door Electron safeStorage (DPAPI) en staat het
 * versleuteld op schijf. Op Android en web valt het terug op localStorage: dat is
 * per apparaat afgeschermd, maar niet versleuteld. Gebruik daarom een token met
 * alleen toegang tot deze ene repo.
 */
export async function getSecret(key: string): Promise<string | null> {
  if (desktop) return desktop.secretGet(key);
  return localStorage.getItem(`secret:${key}`);
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  if (desktop) return desktop.secretSet(key, value);
  if (value === null) localStorage.removeItem(`secret:${key}`);
  else localStorage.setItem(`secret:${key}`, value);
}

export function openExternal(url: string): void {
  if (desktop) {
    void desktop.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Opent het originele Word/Excel-bestand. Alleen zinvol op de pc waar het staat. */
export async function openLocalFile(filePath: string): Promise<string | null> {
  if (!desktop) return 'Het originele bestand staat op je pc en is hier niet te openen.';
  const error = await desktop.openPath(filePath);
  return error || null;
}

export function canOpenLocalFiles(): boolean {
  return Boolean(desktop);
}
