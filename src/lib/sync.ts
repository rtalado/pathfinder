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
}

interface DocumentHandler<T> {
  empty(): T;
  parse(text: string): T;
  merge(local: T, remote: T): { state: T; pulled: number; pushed: number };
  /** Of er iets in staat. Een leeg document hoeven we niet aan te maken. */
  isEmpty(state: T): boolean;
}

const MAX_ATTEMPTS = 4;

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

  for (;;) {
    attempt += 1;
    const remote = await backend.read(name);
    const remoteState = remote ? safeParse(remote.text, handler) : handler.empty();
    const merged = handler.merge(working, remoteState);
    const serialized = `${JSON.stringify(merged.state, null, 2)}\n`;

    // Niets veranderd? Dan niets schrijven; anders staat de opslag vol lege wijzigingen.
    if (remote && normalize(remote.text) === normalize(serialized)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false };
    }

    // Bestaat het nog niet en valt er niets te bewaren? Dan ook niet aanmaken. Dat
    // scheelt bij de eerste synchronisatie een schrijfactie, en juist twee commits
    // vlak na elkaar zijn de reden dat GitHub soms weigert.
    if (!remote && handler.isEmpty(merged.state)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false };
    }

    try {
      await backend.write(name, serialized, remote?.version ?? null);
      return { state: merged.state, pulled: merged.pulled, pushed: merged.pushed, wrote: true };
    } catch (error) {
      if (!(error instanceof SyncConflict)) throw error;
      lastConflict = error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `Opslaan lukte niet in ${MAX_ATTEMPTS} pogingen: de opslag bleef melden dat er intussen ` +
            `iets gewijzigd was. Probeer het zo nog eens. (${lastConflict.detail ?? 'geen details'})`
        );
      }
      // Even wachten voordat we het opnieuw proberen. Bij GitHub is de branch vaak
      // alleen nog niet bijgekomen na onze eigen vorige schrijfactie; meteen
      // opnieuw proberen levert dan gewoon dezelfde weigering op.
      await wait(400 * attempt + Math.random() * 250);
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
