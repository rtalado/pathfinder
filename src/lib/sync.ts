import type { ProgressState, RoadmapLibrary } from '@/types';
import { GitHubError, getFile, putFile, type RepoRef } from './github';
import { emptyProgress, mergeProgress, normalizeProgress } from './progress';
import { emptyLibrary, mergeLibrary, normalizeLibrary } from './library';
import { readSetting, writeSetting } from './storage';

/**
 * De prive repo is de enige waarheid tussen apparaten. Bij elke sync halen we het
 * bestand op, mergen het met wat hier lokaal staat en schrijven het resultaat
 * terug. GitHub weigert de schrijfactie als een ander apparaat er intussen tussen
 * kwam; dan mergen we opnieuw.
 *
 * Er worden twee bestanden bijgehouden. De voortgang verandert vaak en is klein;
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
  message: string;
}

const MAX_ATTEMPTS = 3;

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

async function syncDocument<T>(
  token: string,
  ref: RepoRef,
  filePath: string,
  local: T,
  handler: DocumentHandler<T>
): Promise<SyncOutcome<T>> {
  let attempt = 0;
  let working = local;

  for (;;) {
    attempt += 1;
    const remote = await getFile(token, ref, filePath);
    const remoteState = remote ? safeParse(remote.text, handler) : handler.empty();
    const merged = handler.merge(working, remoteState);
    const serialized = `${JSON.stringify(merged.state, null, 2)}\n`;

    // Niets veranderd? Dan geen commit; anders staat de repo vol lege wijzigingen.
    if (remote && normalize(remote.text) === normalize(serialized)) {
      return { state: merged.state, pulled: merged.pulled, pushed: 0, wrote: false };
    }

    try {
      await putFile(
        token,
        ref,
        filePath,
        serialized,
        remote?.sha ?? null,
        `${handler.message} van ${deviceLabel()} (${deviceId()})`
      );
      return { state: merged.state, pulled: merged.pulled, pushed: merged.pushed, wrote: true };
    } catch (error) {
      const isConflict =
        error instanceof GitHubError && (error.status === 409 || error.status === 422);
      if (!isConflict || attempt >= MAX_ATTEMPTS) throw error;
      // Een ander apparaat was net sneller; met het merge-resultaat opnieuw proberen.
      working = merged.state;
    }
  }
}

export function syncProgress(
  token: string,
  ref: RepoRef,
  filePath: string,
  local: ProgressState
): Promise<SyncOutcome<ProgressState>> {
  return syncDocument(token, ref, filePath, local, {
    empty: emptyProgress,
    parse: (text) => normalizeProgress(JSON.parse(text)),
    merge: mergeProgress,
    message: 'Voortgang',
  });
}

export function syncLibrary(
  token: string,
  ref: RepoRef,
  filePath: string,
  local: RoadmapLibrary
): Promise<SyncOutcome<RoadmapLibrary>> {
  return syncDocument(token, ref, filePath, local, {
    empty: emptyLibrary,
    parse: (text) => normalizeLibrary(JSON.parse(text)),
    merge: mergeLibrary,
    message: 'Leerpaden',
  });
}

/** Het pad van de leerpaden staat naast dat van de voortgang. */
export function libraryPathFor(progressPath: string): string {
  const parts = progressPath.split('/');
  parts[parts.length - 1] = 'roadmaps.json';
  return parts.join('/');
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function safeParse<T>(text: string, handler: DocumentHandler<T>): T {
  try {
    return handler.parse(text);
  } catch {
    // Een kapot bestand mag nooit je lokale gegevens wissen.
    return handler.empty();
  }
}
