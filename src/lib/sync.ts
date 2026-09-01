import type { ProgressState, RoadmapLibrary } from '@/types';
import { emptyProgress, isProgressEmpty, mergeProgress, normalizeProgress } from './progress';
import { emptyLibrary, isLibraryEmpty, mergeLibrary, normalizeLibrary } from './library';
import { SyncConflict, type DocumentName, type SyncBackend } from './syncBackend';

/**
 * De opslag is de enige waarheid tussen apparaten. Bij elke sync halen we het
 * document op, mergen het met wat hier lokaal staat en schrijven het resultaat
 * terug. Is er intussen een ander apparaat geweest, dan weigert de opslag en
 * mergen we opnieuw.
 *
 * Er worden twee documenten bijgehouden. De voortgang verandert vaak en is klein;
 * de zelf toegevoegde leerpaden veranderen zelden en zijn groot. Ze apart houden
 * scheelt bij elke sync onnodig verkeer.
 */

export interface SyncOutcome<T> {
  state: T;
  pulled: number;
  pushed: number;
  /** False als er niets te schrijven viel. */
  wrote: boolean;
  /**
   * Of het document na afloop in de opslag staat. Onwaar betekent: er valt nog
   * niets te bewaren. Zonder dit onderscheid lijkt "niets geschreven omdat alles
   * al klopt" hetzelfde als "niets geschreven omdat er niets is", en dat is
   * precies het verschil waar je naar zoekt als je repository leeg blijft.
   */
  exists: boolean;
}

interface DocumentHandler<T> {
  empty(): T;
  parse(text: string): T;
  merge(local: T, remote: T): { state: T; pulled: number; pushed: number };
  /** Of er iets in staat. Een leeg document hoeven we niet aan te maken. */
  isEmpty(state: T): boolean;
}

const MAX_ATTEMPTS = 5;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function syncDocument<T>(
  backend: SyncBackend,
  name: DocumentName,
  local: T,
  handler: DocumentHandler<T>
): Promise<SyncOutcome<T>> {
  let attempt = 0;
  let working = local;
  let lastConflict: SyncConflict | null = null;
  /** De versie waarmee de vorige poging werd afgewezen. */
  let staleVersion: string | null = null;

  for (;;) {
    attempt += 1;
    const remote = await backend.read(name);
    const remoteState = remote ? safeParse(remote.text, handler) : handler.empty();
    const merged = handler.merge(working, remoteState);
    const serialized = `${JSON.stringify(merged.state, null, 2)}\n`;

    // Niets veranderd? Dan niets schrijven; anders staat de opslag vol lege wijzigingen.
    if (remote && normalize(remote.text) === normalize(serialized)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false, exists: true };
    }

    // Bestaat het nog niet en valt er niets te bewaren? Dan ook niet aanmaken. Dat
    // scheelt bij de eerste synchronisatie een schrijfactie, en juist twee commits
    // vlak na elkaar zijn de reden dat GitHub soms weigert.
    if (!remote && handler.isEmpty(merged.state)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false, exists: false };
    }

    try {
      await backend.write(name, serialized, remote?.version ?? null);
      return {
        state: merged.state,
        pulled: merged.pulled,
        pushed: merged.pushed,
        wrote: true,
        exists: true,
      };
    } catch (error) {
      if (!(error instanceof SyncConflict)) throw error;
      lastConflict = error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `Opslaan lukte niet in ${MAX_ATTEMPTS} pogingen: de opslag bleef melden dat er intussen ` +
            `iets gewijzigd was. Probeer het zo nog eens. (${lastConflict.detail ?? 'geen details'})`
        );
      }
      // Krijgen we bij het opnieuw lezen exact de versie terug die net is
      // afgewezen, dan kijken we naar iets ouds: de opslag loopt achter op zijn
      // eigen schrijfactie. Meteen opnieuw proberen levert dan dezelfde weigering,
      // dus wachten we in dat geval langer.
      const looksStale = remote?.version != null && remote.version === staleVersion;
      staleVersion = remote?.version ?? null;
      await wait((looksStale ? 1500 : 400) * attempt + Math.random() * 400);
      working = merged.state;
    }
  }
}

export function syncProgress(
  backend: SyncBackend,
  local: ProgressState
): Promise<SyncOutcome<ProgressState>> {
  return syncDocument(backend, 'progress', local, {
    empty: emptyProgress,
    parse: (text) => normalizeProgress(JSON.parse(text)),
    merge: mergeProgress,
    isEmpty: isProgressEmpty,
  });
}

export function syncLibrary(
  backend: SyncBackend,
  local: RoadmapLibrary
): Promise<SyncOutcome<RoadmapLibrary>> {
  return syncDocument(backend, 'roadmaps', local, {
    empty: emptyLibrary,
    parse: (text) => normalizeLibrary(JSON.parse(text)),
    merge: mergeLibrary,
    isEmpty: isLibraryEmpty,
  });
}

/**
 * Zet de twee documenten neer, ook als ze nog leeg zijn.
 *
 * Bij het gewone synchroniseren doen we dat expres niet: een leeg document
 * aanmaken is een commit zonder inhoud, en twee commits vlak na elkaar zijn
 * precies waar GitHub over valt. Maar wie net een repository heeft aangemaakt wil
 * zien dat het werkt, in plaats van een lege repository en de vraag of hij iets
 * verkeerd heeft ingevuld. Deze functie hoort dus bij een knop, niet bij de
 * achtergrondsync: hij bewijst dat het schrijven lukt en maakt meteen de eerste
 * commit, waar een repository zonder README nog op wacht.
 */
export async function initializeStorage(
  backend: SyncBackend,
  progress: ProgressState,
  library: RoadmapLibrary
): Promise<{ created: DocumentName[] }> {
  const created: DocumentName[] = [];
  const documents: [DocumentName, unknown][] = [
    ['progress', progress],
    ['roadmaps', library],
  ];

  for (const [name, state] of documents) {
    if (await backend.read(name)) continue;
    if (created.length) {
      // De vorige schrijfactie heeft de branch net verzet; GitHub wil daar even
      // van bijkomen voor hij een tweede commit accepteert.
      await wait(1200);
    }
    await backend.write(name, `${JSON.stringify(state, null, 2)}\n`, null);
    created.push(name);
  }

  return { created };
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function safeParse<T>(text: string, handler: DocumentHandler<T>): T {
  try {
    return handler.parse(text);
  } catch {
    // Een kapot document mag nooit je lokale gegevens wissen.
    return handler.empty();
  }
}
