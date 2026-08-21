import { readSetting, writeSetting } from './storage';

/**
 * Een korte aanduiding per apparaat. Die komt terecht in de commitbeschrijving bij
 * GitHub en in het logboek van je eigen server, zodat je kunt zien waar een
 * wijziging vandaan kwam.
 */

export function deviceId(): string {
  let id = readSetting<string | null>('deviceId', null);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    writeSetting('deviceId', id);
  }
  return id;
}

export function deviceLabel(): string {
  const stored = readSetting<string | null>('deviceLabel', null);
  if (stored) return stored;
  const agent = navigator.userAgent;
  if (/android/i.test(agent)) return 'telefoon';
  if (/electron/i.test(agent)) return 'pc';
  return 'browser';
}

export function deviceName(): string {
  return `${deviceLabel()} (${deviceId()})`;
}
