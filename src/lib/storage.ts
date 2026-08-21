/**
 * Kleine key-value laag boven IndexedDB. Gebruikt voor voortgang, voor je eigen
 * leerpaden en voor gecachete content; dat laatste kan enkele megabytes zijn en
 * past daarom niet in localStorage.
 *
 * IndexedDB kan om redenen buiten de app hangen of geweigerd worden: een browser in
 * privémodus, volle schijf, of opslag die na een crash geblokkeerd is. Daarom is er
 * een tweede weg via localStorage. Die is kleiner, maar beter dan een app die bij
 * het opstarten blijft wachten en niets laat zien.
 */

const DB_NAME = 'learnpath';
const DB_VERSION = 1;
const STORE = 'kv';

/** Zo lang wachten we op IndexedDB; daarna gaan we verder zonder. */
const OPEN_TIMEOUT_MS = 4000;

let dbPromise: Promise<IDBDatabase> | null = null;
let useFallback = typeof indexedDB === 'undefined';

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };

    // Een geblokkeerde database geeft geen fout maar blijft stil wachten.
    const timer = setTimeout(
      () => finish(() => reject(new Error('IndexedDB reageert niet.'))),
      OPEN_TIMEOUT_MS
    );

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      clearTimeout(timer);
      finish(() => reject(error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      finish(() => resolve(request.result));
    };
    request.onerror = () => {
      clearTimeout(timer);
      finish(() => reject(request.error ?? new Error('IndexedDB kon niet worden geopend.')));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      finish(() => reject(new Error('IndexedDB is geblokkeerd.')));
    };
  });

  dbPromise.catch(() => {
    // Eén keer vaststellen dat het niet gaat; daarna niet blijven proberen.
    useFallback = true;
    dbPromise = null;
    console.warn('IndexedDB niet beschikbaar; opslag valt terug op localStorage.');
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

function fallbackGet<T>(key: string): T | undefined {
  const raw = localStorage.getItem(`kv:${key}`);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function fallbackSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`kv:${key}`, JSON.stringify(value));
  } catch {
    // Volle opslag mag de app niet laten crashen; de sync is dan het vangnet.
    console.warn(`Kon "${key}" niet lokaal bewaren; opslag is vol.`);
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (useFallback) return fallbackGet<T>(key);
  try {
    return await run<T | undefined>('readonly', (store) => store.get(key));
  } catch {
    return fallbackGet<T>(key);
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (useFallback) {
    fallbackSet(key, value);
    return;
  }
  try {
    await run('readwrite', (store) => store.put(value, key));
  } catch {
    fallbackSet(key, value);
  }
}

export async function kvDelete(key: string): Promise<void> {
  if (useFallback) {
    localStorage.removeItem(`kv:${key}`);
    return;
  }
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    localStorage.removeItem(`kv:${key}`);
  }
}

export async function kvKeys(): Promise<string[]> {
  const local = Object.keys(localStorage)
    .filter((key) => key.startsWith('kv:'))
    .map((key) => key.slice(3));

  if (useFallback) return local;
  try {
    const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    return [...new Set([...keys.map(String), ...local])];
  } catch {
    return local;
  }
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
