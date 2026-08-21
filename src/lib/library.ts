import type { Roadmap, RoadmapLibrary, Stamped } from '@/types';
import { mergeRecords } from './progress';
import { normalizeRoadmap } from './roadmapImport';

/**
 * De verzameling leerpaden die je zelf hebt toegevoegd. Ze staan los van de
 * meegeleverde leerpaden en worden als eigen document gesynchroniseerd, zodat een
 * leerpad dat je op je pc importeert ook op je telefoon verschijnt.
 */

export const LIBRARY_SCHEMA = 1;

export function emptyLibrary(): RoadmapLibrary {
  return { schema: LIBRARY_SCHEMA, roadmaps: {} };
}

export function normalizeLibrary(input: unknown): RoadmapLibrary {
  if (!input || typeof input !== 'object') return emptyLibrary();
  const raw = input as Partial<RoadmapLibrary>;
  const roadmaps: Record<string, Stamped<Roadmap | null>> = {};

  for (const [id, entry] of Object.entries(raw.roadmaps ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
    if (entry.value === null) {
      roadmaps[id] = { value: null, updatedAt };
      continue;
    }
    try {
      // Ook binnengekomen leerpaden van een ander apparaat controleren we; een
      // kapot leerpad mag de app niet laten struikelen.
      roadmaps[id] = { value: normalizeRoadmap(entry.value), updatedAt };
    } catch {
      // Overslaan.
    }
  }

  return { schema: LIBRARY_SCHEMA, roadmaps };
}

export function mergeLibrary(
  local: RoadmapLibrary,
  remote: RoadmapLibrary
): { state: RoadmapLibrary; pulled: number; pushed: number } {
  const merged = mergeRecords<Roadmap | null>(local.roadmaps, remote.roadmaps ?? {});
  return {
    state: { schema: LIBRARY_SCHEMA, roadmaps: merged.merged },
    pulled: merged.pulled,
    pushed: merged.pushed,
  };
}

/** De leerpaden die daadwerkelijk bestaan, dus zonder de verwijderde. */
export function activeRoadmaps(library: RoadmapLibrary): Roadmap[] {
  return Object.values(library.roadmaps)
    .map((entry) => entry.value)
    .filter((roadmap): roadmap is Roadmap => Boolean(roadmap))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title));
}

export function findRoadmap(library: RoadmapLibrary, id: string): Roadmap | null {
  return library.roadmaps[id]?.value ?? null;
}

/** Hoeveel ruimte de verzameling inneemt; relevant omdat hij mee gaat in de sync. */
export function librarySize(library: RoadmapLibrary): number {
  return JSON.stringify(library).length;
}
