/**
 * Synchroniseren vanuit de terminal, volgens hetzelfde recept als de app:
 * document lezen met zijn versie, lokaal samenvoegen, terugschrijven met die
 * versie erbij. Weigert de opslag, dan is er intussen iets veranderd en gaan we
 * opnieuw. Zo komen pc, telefoon en terminal op hetzelfde uit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths } from './paths.mjs';
import {
  isLibraryEmpty,
  isProgressEmpty,
  mergeLibrary,
  mergeProgress,
  normalizeLibrary,
  normalizeProgress,
} from './progress.mjs';

const API = 'https://api.github.com';

export class SyncConflict extends Error {
  constructor(detail) {
    super(detail ? `De opslag was net gewijzigd: ${detail}` : 'De opslag was net gewijzigd.');
    this.name = 'SyncConflict';
  }
}

export class SyncError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SyncError';
    this.status = status;
  }
}

/** Zodat je in het logboek van je eigen server ziet welk apparaat schreef. */
export function deviceName() {
  return `${os.hostname()} (terminal)`;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pathfinder-tui',
  };
}

async function githubFail(response) {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body?.message) message = body.message;
  } catch {
    // Geen JSON-body; de statustekst is dan het beste wat we hebben.
  }
  if (response.status === 401) message = 'Token afgewezen. Controleer of hij nog geldig is.';
  if (response.status === 403 && /rate limit/i.test(message)) {
    message = 'GitHub-limiet bereikt. Probeer het over een paar minuten opnieuw.';
  }
  throw new SyncError(message, response.status);
}

/** Het pad van een document ligt naast dat van de voortgang, in dezelfde map. */
function githubPath(basePath, name) {
  const parts = basePath.split('/');
  parts[parts.length - 1] = `${name}.json`;
  return parts.join('/');
}

export function githubBackend(token, ref, basePath) {
  const contents = (name) =>
    `${API}/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(githubPath(basePath, name))}`;

  return {
    kind: 'github',
    label: `${ref.owner}/${ref.repo}`,

    async read(name) {
      // Nooit uit de cache: vlak na je eigen schrijfactie krijg je anders de oude
      // sha terug en weigert GitHub de volgende schrijfactie.
      const response = await fetch(`${contents(name)}?ref=${encodeURIComponent(ref.branch)}`, {
        cache: 'no-store',
        headers: githubHeaders(token),
      });
      if (response.status === 404) return null;
      if (!response.ok) await githubFail(response);
      const body = await response.json();
      return {
        text: Buffer.from(body.content ?? '', 'base64').toString('utf8'),
        version: body.sha,
      };
    },

    async write(name, text, version) {
      const response = await fetch(contents(name), {
        method: 'PUT',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${name === 'progress' ? 'Voortgang' : 'Leerpaden'} van ${deviceName()}`,
          content: Buffer.from(text, 'utf8').toString('base64'),
          branch: ref.branch,
          ...(version ? { sha: version } : {}),
        }),
      });
      // 409 en 422 betekenen allebei: jij ging van een oudere versie uit.
      if (response.status === 409 || response.status === 422) {
        throw new SyncConflict(String(response.status));
      }
      if (!response.ok) await githubFail(response);
      const body = await response.json();
      return { text, version: body.content?.sha };
    },
  };
}

/** Onbewerkt bestand uit de repository; gebruikt om content op te halen. */
async function getRawFile(token, ref, filePath) {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(ref.branch)}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { ...githubHeaders(token), Accept: 'application/vnd.github.raw' },
  });
  if (!response.ok) await githubFail(response);
  return response.text();
}

// ---------------------------------------------------------------------------
// Eigen server
// ---------------------------------------------------------------------------

export function normalizeServerUrl(input) {
  const trimmed = String(input ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function serverRequest(base, token, endpoint, init) {
  let response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      cache: 'no-store',
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Pathfinder-Device': deviceName(),
      },
    });
  } catch {
    // Server uit, of je zit niet op hetzelfde netwerk; dat is de gewone oorzaak.
    throw new SyncError(`Geen verbinding met ${base}.`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new SyncError('De server weigert dit token.', response.status);
  }
  return response;
}

export function serverBackend(url, token) {
  const base = normalizeServerUrl(url);
  return {
    kind: 'server',
    label: base,

    async read(name) {
      const response = await serverRequest(base, token, `/api/v1/doc/${name}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new SyncError(`De server antwoordde met ${response.status}.`, response.status);
      }
      const body = await response.json();
      return { text: String(body.data ?? ''), version: String(body.version ?? '') };
    },

    async write(name, text, version) {
      const response = await serverRequest(base, token, `/api/v1/doc/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ version, data: text }),
      });
      if (response.status === 409) {
        throw new SyncConflict(`versie ${version ?? 'nieuw'} was verlopen`);
      }
      if (!response.ok) {
        throw new SyncError(`Opslaan mislukt (${response.status}).`, response.status);
      }
      const body = await response.json();
      return { text, version: String(body.version ?? '') };
    },
  };
}

export async function pingServer(url, token) {
  const base = normalizeServerUrl(url);
  if (!base) throw new SyncError('Vul eerst het adres van je server in.');
  const response = await serverRequest(base, token, '/api/v1/health');
  if (!response.ok) {
    throw new SyncError(`De server antwoordde met ${response.status}.`, response.status);
  }
  const body = await response.json();
  if (body?.name !== 'pathfinder-server') {
    throw new SyncError('Op dit adres draait iets anders dan de Pathfinder-server.');
  }
  return {
    name: body.name,
    version: String(body.version ?? '?'),
    documents: Number(body.documents ?? 0),
  };
}

// ---------------------------------------------------------------------------
// De synchronisatie zelf
// ---------------------------------------------------------------------------

export function backendFor(sync, token) {
  if (sync.backend === 'server') {
    if (!normalizeServerUrl(sync.serverUrl)) {
      throw new SyncError('Vul eerst het adres van je server in.');
    }
    return serverBackend(sync.serverUrl, token);
  }
  if (!sync.owner || !sync.repo) {
    throw new SyncError('Vul eerst je GitHub-gebruikersnaam en repository in.');
  }
  const ref = { owner: sync.owner, repo: sync.repo, branch: sync.branch || 'main' };
  return githubBackend(token, ref, sync.path || 'sync/progress.json');
}

const MAX_ATTEMPTS = 5;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\r\n/g, '\n').trim();

async function syncDocument(backend, name, local, handler) {
  let attempt = 0;
  let working = local;
  /** De versie waarmee de vorige poging werd afgewezen. */
  let staleVersion = null;

  for (;;) {
    attempt += 1;
    const remote = await backend.read(name);
    let remoteState;
    try {
      remoteState = remote ? handler.parse(remote.text) : handler.empty();
    } catch {
      // Een kapot document mag nooit je lokale gegevens wissen.
      remoteState = handler.empty();
    }

    const merged = handler.merge(working, remoteState);
    const serialized = `${JSON.stringify(merged.state, null, 2)}\n`;

    // Niets veranderd? Dan niets schrijven; anders staat de opslag vol lege wijzigingen.
    if (remote && normalizeText(remote.text) === normalizeText(serialized)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false };
    }
    // Nog niets te bewaren? Dan ook geen leeg bestand aanmaken.
    if (!remote && handler.isEmpty(merged.state)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false };
    }

    try {
      await backend.write(name, serialized, remote?.version ?? null);
      return { state: merged.state, pulled: merged.pulled, pushed: merged.pushed, wrote: true };
    } catch (error) {
      if (!(error instanceof SyncConflict)) throw error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new SyncError(
          `Opslaan lukte niet in ${MAX_ATTEMPTS} pogingen: de opslag bleef melden dat er intussen iets gewijzigd was.`
        );
      }
      // Krijgen we exact de versie terug die net geweigerd werd, dan loopt de
      // opslag achter op zijn eigen schrijfactie; haast heeft dan geen zin.
      const looksStale = remote?.version != null && remote.version === staleVersion;
      staleVersion = remote?.version ?? null;
      await wait((looksStale ? 1500 : 400) * attempt + Math.random() * 400);
      working = merged.state;
    }
  }
}

export function syncProgress(backend, local) {
  return syncDocument(backend, 'progress', local, {
    empty: () => normalizeProgress(null),
    parse: (text) => normalizeProgress(JSON.parse(text)),
    merge: mergeProgress,
    isEmpty: isProgressEmpty,
  });
}

export function syncLibrary(backend, local) {
  return syncDocument(backend, 'roadmaps', local, {
    empty: () => normalizeLibrary(null),
    parse: (text) => normalizeLibrary(JSON.parse(text)),
    merge: mergeLibrary,
    isEmpty: isLibraryEmpty,
  });
}

/**
 * Haalt de leerpaden en documenten uit de repository, maar alleen de bestanden
 * waarvan de hash afwijkt. Een leerpad erbij kost zo een paar kilobytes.
 */
export async function pullContent(token, ref, onProgress) {
  let remote;
  try {
    remote = JSON.parse(await getRawFile(token, ref, 'content/manifest.json'));
  } catch (error) {
    // Een repository die alleen je voortgang bewaart heeft geen content; dat is
    // de normale situatie voor wie de app gewoon gebruikt, dus geen fout.
    if (error instanceof SyncError && error.status === 404) return { status: 'none' };
    throw error;
  }

  const target = paths.pulledContent;
  let current = { contentVersion: null, files: [] };
  try {
    current = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
  } catch {
    // Nog niets opgehaald; dan halen we alles.
  }

  if (current.contentVersion === remote.contentVersion) {
    return { status: 'current', contentVersion: remote.contentVersion };
  }

  const known = new Map((current.files ?? []).map((file) => [file.path, file.hash]));
  const changed = remote.files.filter((file) => known.get(file.path) !== file.hash);

  let done = 0;
  onProgress?.(0, changed.length);
  for (const file of changed) {
    const text = await getRawFile(token, ref, `content/${file.path}`);
    const destination = path.join(target, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, text);
    done += 1;
    onProgress?.(done, changed.length);
  }

  // Het manifest gaat er als laatste in: valt de verbinding halverwege weg, dan
  // blijft de oude versie gelden en probeert de volgende sync het opnieuw.
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(remote, null, 2)}\n`);
  return { status: 'updated', changedFiles: changed.length, contentVersion: remote.contentVersion };
}
