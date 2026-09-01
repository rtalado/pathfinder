import type { RepoRef } from './github';
import { GitHubError, getFile, getRepo, putFile, repoIsEmpty } from './github';
import { deviceName } from './device';

/**
 * De opslag waar de synchronisatie naartoe schrijft. Er zijn er twee, en de
 * synclaag erboven weet niet welke hij gebruikt:
 *
 *  - **GitHub**: een prive repository. Geen server nodig, wel een account.
 *  - **Eigen server**: een klein programma op bijvoorbeeld een Raspberry Pi.
 *    Je gegevens verlaten je huis niet, maar je moet hem zelf draaiend houden.
 *
 * Beide werken volgens hetzelfde principe: lees het document met zijn versie,
 * voeg lokaal samen, schrijf terug met die versie erbij. Is de versie inmiddels
 * veranderd, dan weigert de opslag en probeert de synclaag het opnieuw.
 */

/** De twee documenten die worden gesynchroniseerd. */
export type DocumentName = 'progress' | 'roadmaps';

export interface SyncDocument {
  text: string;
  /** Wat de opslag gebruikt om te zien of jij van de laatste versie uitging. */
  version: string;
}

export interface SyncBackend {
  kind: 'github' | 'server';
  /** Voor in meldingen: waar wordt naartoe geschreven. */
  label: string;
  read(name: DocumentName): Promise<SyncDocument | null>;
  write(name: DocumentName, text: string, version: string | null): Promise<SyncDocument>;
}

/**
 * De opslag wilde niet schrijven omdat er iets veranderd was sinds we lazen.
 *
 * Dat hoeft niet te betekenen dat een ander apparaat bezig was. GitHub maakt van
 * elke schrijfactie een commit, en twee commits vlak na elkaar op dezelfde branch
 * leveren ook een 409 op: de branch is dan al verschoven door onze eigen vorige
 * schrijfactie. Vandaar dat de melding niemand de schuld geeft en de synclaag het
 * gewoon opnieuw probeert.
 */
export class SyncConflict extends Error {
  constructor(readonly detail?: string) {
    super(detail ? `De opslag was net gewijzigd: ${detail}` : 'De opslag was net gewijzigd.');
    this.name = 'SyncConflict';
  }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/** De leerpaden staan naast de voortgang, in dezelfde map. */
function githubPath(basePath: string, name: DocumentName): string {
  const parts = basePath.split('/');
  parts[parts.length - 1] = `${name}.json`;
  return parts.join('/');
}

/**
 * GitHub antwoordt met een kaal "Not Found" op drie heel verschillende situaties:
 * de repository bestaat niet, je token mag er niet bij, of de branch bestaat nog
 * niet. Aan die melding heeft niemand iets, dus zoeken we bij een 404 uit welke
 * van de drie het is. Dat kost alleen bij een fout een extra verzoek.
 */
async function explain404(token: string, ref: RepoRef, message: string): Promise<string> {
  try {
    await getRepo(token, ref.owner, ref.repo);
  } catch {
    return (
      `De repository ${ref.owner}/${ref.repo} bestaat niet, of je token heeft er geen toegang toe. ` +
      'Een fine-grained token geef je per repository rechten: controleer of deze erbij staat, met Contents: read and write.'
    );
  }

  try {
    if (await repoIsEmpty(token, ref.owner, ref.repo)) {
      return (
        `De repository ${ref.owner}/${ref.repo} heeft nog geen enkele commit, en de app kreeg hem ook niet aangemaakt. ` +
        'Maak op GitHub een bestand aan (bijvoorbeeld een README) en probeer het daarna opnieuw.'
      );
    }
  } catch {
    // Dan houden we het bij de melding hieronder.
  }

  return (
    `De branch "${ref.branch}" bestaat niet in ${ref.owner}/${ref.repo}. ` +
    'Vul bij Geavanceerd de branch in die de repository wel heeft. ' +
    `(GitHub: ${message})`
  );
}

export function githubBackend(token: string, ref: RepoRef, basePath: string): SyncBackend {
  return {
    kind: 'github',
    label: `${ref.owner}/${ref.repo}`,

    async read(name) {
      const file = await getFile(token, ref, githubPath(basePath, name));
      return file ? { text: file.text, version: file.sha } : null;
    },

    async write(name, text, version) {
      try {
        const result = await putFile(
          token,
          ref,
          githubPath(basePath, name),
          text,
          version,
          `${name === 'progress' ? 'Voortgang' : 'Leerpaden'} van ${deviceName()}`
        );
        return { text, version: result.sha };
      } catch (error) {
        if (error instanceof GitHubError && (error.status === 409 || error.status === 422)) {
          throw new SyncConflict(error.message);
        }
        if (error instanceof GitHubError && error.status === 404) {
          throw new GitHubError(await explain404(token, ref, error.message), 404);
        }
        if (error instanceof GitHubError && error.status === 403) {
          throw new GitHubError(
            `${error.message} Het token mag niet schrijven in ${ref.owner}/${ref.repo}; ` +
              'een fine-grained token heeft daarvoor Contents: read and write nodig.',
            403
          );
        }
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Eigen server
// ---------------------------------------------------------------------------

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** Haalt er een schoon basisadres uit, ook als iemand een schuine streep vergeet. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function serverRequest(
  url: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      // Nooit uit de cache: anders lees je vlak na je eigen schrijfactie de oude
      // versie terug en denkt de server dat je van een verouderde versie uitgaat.
      cache: 'no-store',
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Zodat je in het logboek van je server ziet welk apparaat schreef.
        'X-Pathfinder-Device': deviceName(),
      },
    });
  } catch {
    // Een mislukte verbinding is de meest voorkomende situatie: server uit, of
    // je zit niet op hetzelfde netwerk.
    throw new ServerError(`Geen verbinding met ${url}.`, 0);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ServerError('De server weigert dit token.', response.status);
  }
  return response;
}

export function serverBackend(url: string, token: string): SyncBackend {
  const base = normalizeServerUrl(url);

  return {
    kind: 'server',
    label: base,

    async read(name) {
      const response = await serverRequest(base, token, `/api/v1/doc/${name}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new ServerError(`De server antwoordde met ${response.status}.`, response.status);
      }
      const body = await response.json();
      return { text: String(body.data ?? ''), version: String(body.version ?? '') };
    },

    async write(name, text, version) {
      const response = await serverRequest(base, token, `/api/v1/doc/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ version, data: text }),
      });
      if (response.status === 409) throw new SyncConflict(`versie ${version ?? 'nieuw'} was verlopen`);
      if (!response.ok) {
        throw new ServerError(`Opslaan mislukt (${response.status}).`, response.status);
      }
      const body = await response.json();
      return { text, version: String(body.version ?? '') };
    },
  };
}

export interface ServerInfo {
  name: string;
  version: string;
  documents: number;
}

/** Voor de knop "Verbinding testen" in de instellingen. */
export async function pingServer(url: string, token: string): Promise<ServerInfo> {
  const base = normalizeServerUrl(url);
  if (!base) throw new ServerError('Vul eerst het adres van je server in.', 0);

  const response = await serverRequest(base, token, '/api/v1/health');
  if (!response.ok) {
    throw new ServerError(`De server antwoordde met ${response.status}.`, response.status);
  }

  const body = await response.json();
  if (body?.name !== 'pathfinder-server') {
    throw new ServerError('Op dit adres draait iets anders dan de Pathfinder-server.', 0);
  }
  return {
    name: String(body.name),
    version: String(body.version ?? '?'),
    documents: Number(body.documents ?? 0),
  };
}
