/**
 * Kleine key-value laag boven IndexedDB. Gebruikt voor voortgang en voor de
 * gecachete content die van GitHub komt; die laatste kan enkele megabytes zijn
 * en past daarom niet in localStorage.
 */

const DB_NAME = 'learnpath';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      })
  );
}

/** Valt terug op localStorage als IndexedDB niet beschikbaar is (privacy-modus, oude webview). */
const hasIndexedDb = typeof indexedDB !== 'undefined';

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb) {
    const raw = localStorage.getItem(`kv:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  try {
    return await run<T | undefined>('readonly', (store) => store.get(key));
  } catch {
    return undefined;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (!hasIndexedDb) {
    localStorage.setItem(`kv:${key}`, JSON.stringify(value));
    return;
  }
  await run('readwrite', (store) => store.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  if (!hasIndexedDb) {
    localStorage.removeItem(`kv:${key}`);
    return;
  }
  await run('readwrite', (store) => store.delete(key));
}

export async function kvKeys(): Promise<string[]> {
  if (!hasIndexedDb) {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith('kv:'))
      .map((key) => key.slice(3));
  }
  const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  return keys.map(String);
}

/** Instellingen zijn klein en worden synchroon gelezen bij het opstarten. */
export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`setting:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`setting:${key}`, JSON.stringify(value));
  } catch {
    // Volle opslag mag de app niet laten crashen.
  }
}
