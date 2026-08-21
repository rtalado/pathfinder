import type { CardReview, NodeStatus, ProgressState, Stamped } from '@/types';

export const PROGRESS_SCHEMA = 1;

export function emptyProgress(): ProgressState {
  return { schema: PROGRESS_SCHEMA, nodes: {}, notes: {}, resources: {}, cards: {}, activity: {} };
}

export function nodeKey(roadmapId: string, nodeId: string): string {
  return `${roadmapId}/${nodeId}`;
}

export function resourceKey(roadmapId: string, nodeId: string, resourceId: string): string {
  return `${roadmapId}/${nodeId}/${resourceId}`;
}

export function stamp<T>(value: T, at = Date.now()): Stamped<T> {
  return { value, updatedAt: at };
}

export function today(date = new Date()): string {
  // Lokale datum, niet UTC: een streak hoort bij de dag zoals jij hem beleeft.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Per sleutel wint de meest recente wijziging. Dat is genoeg omdat je in de
 * praktijk niet op twee apparaten tegelijk hetzelfde vinkje zet, en het voorkomt
 * dat een oude telefoonstaat je pc-voortgang terugdraait.
 */
export function mergeRecords<T>(
  local: Record<string, Stamped<T>>,
  remote: Record<string, Stamped<T>>
): { merged: Record<string, Stamped<T>>; pulled: number; pushed: number } {
  const merged: Record<string, Stamped<T>> = { ...local };
  let pulled = 0;
  let pushed = 0;

  for (const [key, remoteEntry] of Object.entries(remote)) {
    const localEntry = local[key];
    if (!localEntry || remoteEntry.updatedAt > localEntry.updatedAt) {
      merged[key] = remoteEntry;
      pulled += 1;
    } else if (localEntry.updatedAt > remoteEntry.updatedAt) {
      pushed += 1;
    }
  }
  for (const key of Object.keys(local)) {
    if (!(key in remote)) pushed += 1;
  }

  return { merged, pulled, pushed };
}

export interface MergeResult {
  state: ProgressState;
  pulled: number;
  pushed: number;
}

export function mergeProgress(local: ProgressState, remote: ProgressState): MergeResult {
  const nodes = mergeRecords<NodeStatus>(local.nodes, remote.nodes ?? {});
  const notes = mergeRecords<string>(local.notes, remote.notes ?? {});
  const resources = mergeRecords<boolean>(local.resources, remote.resources ?? {});
  const cards = mergeRecords<CardReview>(local.cards, remote.cards ?? {});

  // Activiteit is een teller per dag; het hoogste getal is het volledigste beeld.
  const activity: Record<string, number> = { ...local.activity };
  for (const [day, count] of Object.entries(remote.activity ?? {})) {
    activity[day] = Math.max(activity[day] ?? 0, count);
  }

  return {
    state: {
      schema: PROGRESS_SCHEMA,
      nodes: nodes.merged,
      notes: notes.merged,
      resources: resources.merged,
      cards: cards.merged,
      activity,
    },
    pulled: nodes.pulled + notes.pulled + resources.pulled + cards.pulled,
    pushed: nodes.pushed + notes.pushed + resources.pushed + cards.pushed,
  };
}

/** Repareert ontbrekende velden zodat een oud of half bestand de app niet sloopt. */
export function normalizeProgress(input: unknown): ProgressState {
  const base = emptyProgress();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Partial<ProgressState>;
  return {
    schema: PROGRESS_SCHEMA,
    nodes: raw.nodes ?? {},
    notes: raw.notes ?? {},
    resources: raw.resources ?? {},
    cards: raw.cards ?? {},
    activity: raw.activity ?? {},
  };
}

export interface StreakInfo {
  current: number;
  longest: number;
  activeToday: boolean;
}

export function computeStreak(activity: Record<string, number>): StreakInfo {
  const days = Object.entries(activity)
    .filter(([, count]) => count > 0)
    .map(([day]) => day)
    .sort();
  if (!days.length) return { current: 0, longest: 0, activeToday: false };

  const set = new Set(days);
  const todayKey = today();
  const activeToday = set.has(todayKey);

  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of days) {
    const date = new Date(`${day}T00:00:00`);
    const isNext =
      previous !== null && Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1;
    run = isNext ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  // De huidige reeks telt terug vanaf vandaag, of vanaf gisteren als je vandaag
  // nog niets hebt gedaan; anders zou de streak om middernacht al breken.
  let current = 0;
  const cursor = new Date(`${todayKey}T00:00:00`);
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  while (set.has(today(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest, activeToday };
}
