import type { ProgressState, RoadmapLibrary } from '@/types';
import { emptyProgress, mergeProgress, normalizeProgress } from './progress';
import { emptyLibrary, mergeLibrary, normalizeLibrary } from './library';
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
}

const MAX_ATTEMPTS = 3;

async function syncDocument<T>(
  backend: SyncBackend,
  name: DocumentName,
  local: T,
  handler: DocumentHandler<T>
): Promise<SyncOutcome<T>> {
  let attempt = 0;
  let working = local;

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

    try {
      await backend.write(name, serialized, remote?.version ?? null);
      return { state: merged.state, pulled: merged.pulled, pushed: merged.pushed, wrote: true };
    } catch (error) {
      if (!(error instanceof SyncConflict) || attempt >= MAX_ATTEMPTS) throw error;
      // Een ander apparaat was net sneller; met het merge-resultaat opnieuw proberen.
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
