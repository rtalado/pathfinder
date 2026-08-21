import { create } from 'zustand';
import type { CardReview, NodeStatus, ProgressState, Roadmap, RoadmapLibrary, SyncStatus } from '@/types';
import { NODE_STATUSES } from '@/types';
import { kvGet, kvSet } from '@/lib/storage';
import {
  computeStreak,
  emptyProgress,
  nodeKey,
  normalizeProgress,
  resourceKey,
  stamp,
  today,
} from '@/lib/progress';
import { emptyLibrary, normalizeLibrary } from '@/lib/library';
import { newCard, reviewCard, type Grade } from '@/lib/srs';
import { syncLibrary, syncProgress } from '@/lib/sync';
import { githubBackend, serverBackend } from '@/lib/syncBackend';
import { pullContentFromGitHub } from '@/lib/content';
import { readToken, useSettings } from './settingsStore';

const PROGRESS_KEY = 'progress';
const LIBRARY_KEY = 'library';
const SAVE_DEBOUNCE_MS = 400;
const SYNC_DEBOUNCE_MS = 6_000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

interface SyncOptions {
  silent?: boolean;
  /** Bij een sync die alleen door een vinkje is uitgelokt hoeven de leerpaden niet mee. */
  skipLibrary?: boolean;
}

interface ProgressStore {
  state: ProgressState;
  library: RoadmapLibrary;
  hydrated: boolean;
  sync: SyncStatus;
  /** Loopt op zodra er nieuwe content of een nieuw leerpad is; schermen laden dan opnieuw. */
  contentVersion: number;

  init(): Promise<void>;
  setNodeStatus(roadmapId: string, nodeId: string, status: NodeStatus): void;
  cycleNodeStatus(roadmapId: string, nodeId: string): void;
  setNote(roadmapId: string, nodeId: string, text: string): void;
  setResourceRead(roadmapId: string, nodeId: string, resourceId: string, read: boolean): void;
  gradeCard(roadmapId: string, nodeId: string, cardId: string, grade: Grade): void;
  resetRoadmap(roadmapId: string): void;

  saveRoadmap(roadmap: Roadmap): Promise<void>;
  deleteRoadmap(roadmapId: string): Promise<void>;

  syncNow(options?: SyncOptions): Promise<void>;
  startAutoSync(): void;
  stopAutoSync(): void;
}

function scheduleSave(state: ProgressState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void kvSet(PROGRESS_KEY, state);
  }, SAVE_DEBOUNCE_MS);
}

function scheduleSync(run: () => void) {
  if (syncTimer) clearTimeout(syncTimer);
  // Niet bij elke klik meteen een commit; even wachten scheelt tientallen commits.
  syncTimer = setTimeout(run, SYNC_DEBOUNCE_MS);
}

/** Onthoudt of er sinds de laatste sync iets aan de leerpaden is veranderd. */
let libraryDirty = false;

/**
 * Twee syncs tegelijk botsen op elkaar: de tweede gaat uit van een versie die de
 * eerste net heeft vervangen. Dat lost zichzelf op, maar het kost een ronde. Bij
 * het opstarten gebeurt het makkelijk, omdat het venster ook meteen focus krijgt.
 * Een wijziging die tijdens een sync ontstaat plant altijd zijn eigen sync in, dus
 * overslaan is veilig.
 */
let syncing = false;

export const useProgress = create<ProgressStore>((set, get) => {
  /** Past de voortgang aan, bewaart hem en plant een sync in. */
  function update(mutate: (draft: ProgressState) => void, options?: { countsAsActivity?: boolean }) {
    const current = get().state;
    const draft: ProgressState = {
      ...current,
      nodes: { ...current.nodes },
      notes: { ...current.notes },
      resources: { ...current.resources },
      cards: { ...current.cards },
      activity: { ...current.activity },
    };
    mutate(draft);
    if (options?.countsAsActivity) {
      const day = today();
      draft.activity[day] = (draft.activity[day] ?? 0) + 1;
    }
    set({ state: draft });
    scheduleSave(draft);
    if (useSettings.getState().sync.enabled) {
      scheduleSync(() => void get().syncNow({ silent: true, skipLibrary: true }));
    }
  }

  async function storeLibrary(library: RoadmapLibrary) {
    libraryDirty = true;
    set({ library, contentVersion: get().contentVersion + 1 });
    await kvSet(LIBRARY_KEY, library);
    if (useSettings.getState().sync.enabled) {
      scheduleSync(() => void get().syncNow({ silent: true }));
    }
  }

  return {
    state: emptyProgress(),
    library: emptyLibrary(),
    hydrated: false,
    sync: { phase: 'unconfigured', lastSyncedAt: null },
    contentVersion: 0,

    async init() {
      const [storedProgress, storedLibrary] = await Promise.all([
        kvGet<ProgressState>(PROGRESS_KEY),
        kvGet<RoadmapLibrary>(LIBRARY_KEY),
      ]);
      set({
        state: normalizeProgress(storedProgress),
        library: normalizeLibrary(storedLibrary),
        hydrated: true,
        sync: {
          phase: useSettings.getState().sync.enabled ? 'idle' : 'unconfigured',
          lastSyncedAt: null,
        },
      });
    },

    setNodeStatus(roadmapId, nodeId, status) {
      const key = nodeKey(roadmapId, nodeId);
      const wasDone = get().state.nodes[key]?.value === 'done';
      update(
        (draft) => {
          draft.nodes[key] = stamp(status);
        },
        { countsAsActivity: status === 'done' && !wasDone }
      );
    },

    cycleNodeStatus(roadmapId, nodeId) {
      const key = nodeKey(roadmapId, nodeId);
      const current = get().state.nodes[key]?.value ?? 'todo';
      const next = NODE_STATUSES[(NODE_STATUSES.indexOf(current) + 1) % NODE_STATUSES.length];
      get().setNodeStatus(roadmapId, nodeId, next);
    },

    setNote(roadmapId, nodeId, text) {
      const key = nodeKey(roadmapId, nodeId);
      update((draft) => {
        if (text.trim()) draft.notes[key] = stamp(text);
        else delete draft.notes[key];
      });
    },

    setResourceRead(roadmapId, nodeId, resourceId, read) {
      const key = resourceKey(roadmapId, nodeId, resourceId);
      update((draft) => {
        draft.resources[key] = stamp(read);
      });
    },

    gradeCard(roadmapId, nodeId, cardId, grade) {
      const key = resourceKey(roadmapId, nodeId, cardId);
      const existing: CardReview = get().state.cards[key]?.value ?? newCard();
      update(
        (draft) => {
          draft.cards[key] = stamp(reviewCard(existing, grade));
        },
        { countsAsActivity: true }
      );
    },

    resetRoadmap(roadmapId) {
      const prefix = `${roadmapId}/`;
      update((draft) => {
        for (const record of [draft.nodes, draft.notes, draft.resources, draft.cards]) {
          for (const key of Object.keys(record)) {
            if (key.startsWith(prefix)) delete (record as Record<string, unknown>)[key];
          }
        }
      });
    },

    async saveRoadmap(roadmap) {
      const library = get().library;
      await storeLibrary({
        ...library,
        roadmaps: { ...library.roadmaps, [roadmap.id]: stamp(roadmap) },
      });
    },

    async deleteRoadmap(roadmapId) {
      const library = get().library;
      // Als grafsteen bewaren, anders komt het leerpad bij de volgende sync terug.
      await storeLibrary({
        ...library,
        roadmaps: { ...library.roadmaps, [roadmapId]: stamp(null) },
      });
      get().resetRoadmap(roadmapId);
    },

    async syncNow(options) {
      if (syncing) return;
      const settings = useSettings.getState().sync;
      const configured =
        settings.enabled &&
        (settings.backend === 'server'
          ? Boolean(settings.serverUrl.trim())
          : Boolean(settings.owner && settings.repo));

      if (!configured) {
        set({ sync: { ...get().sync, phase: 'unconfigured' } });
        return;
      }

      const token = await readToken();
      if (!token) {
        set({
          sync: {
            ...get().sync,
            phase: 'error',
            message:
              settings.backend === 'server'
                ? 'Geen toegangssleutel voor je server ingesteld.'
                : 'Geen GitHub-token ingesteld.',
          },
        });
        return;
      }
      if (!navigator.onLine) {
        set({ sync: { ...get().sync, phase: 'offline', message: 'Geen verbinding.' } });
        return;
      }

      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      syncing = true;
      set({ sync: { ...get().sync, phase: 'syncing', message: undefined } });

      const ref = { owner: settings.owner, repo: settings.repo, branch: settings.branch };
      const backend =
        settings.backend === 'server'
          ? serverBackend(settings.serverUrl, token)
          : githubBackend(token, ref, settings.path);

      try {
        const outcome = await syncProgress(backend, get().state);
        set({ state: outcome.state });
        await kvSet(PROGRESS_KEY, outcome.state);

        let extra = '';

        if (!options?.skipLibrary || libraryDirty) {
          const library = await syncLibrary(backend, get().library);
          libraryDirty = false;
          if (library.pulled > 0) {
            set({ library: library.state, contentVersion: get().contentVersion + 1 });
            extra += ` ${library.pulled} leerpad(en) opgehaald.`;
          } else {
            set({ library: library.state });
          }
          await kvSet(LIBRARY_KEY, library.state);
        }

        if (settings.backend === 'github' && settings.pullContent) {
          try {
            const result = await pullContentFromGitHub(token, ref);
            if (result.updated) {
              set({ contentVersion: get().contentVersion + 1 });
              extra += ` ${result.changedFiles} contentbestand(en) bijgewerkt.`;
            }
          } catch (error) {
            // Content ophalen is bijvangst; het mag de voortgangssync niet laten mislukken.
            console.warn('Content bijwerken mislukt:', error);
          }
        }

        set({
          sync: {
            phase: 'ok',
            lastSyncedAt: Date.now(),
            pulled: outcome.pulled,
            pushed: outcome.pushed,
            message: options?.silent ? undefined : `Gesynchroniseerd.${extra}`,
          },
        });
      } catch (error) {
        set({
          sync: {
            ...get().sync,
            phase: 'error',
            message: error instanceof Error ? error.message : 'Synchroniseren mislukt.',
          },
        });
      } finally {
        syncing = false;
      }
    },

    startAutoSync() {
      get().stopAutoSync();
      const minutes = useSettings.getState().sync.autoSyncMinutes;
      if (!minutes) return;
      autoSyncTimer = setInterval(
        () => void get().syncNow({ silent: true }),
        Math.max(1, minutes) * 60_000
      );
    },

    stopAutoSync() {
      if (autoSyncTimer) clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    },
  };
});

/** Handige selectors; buiten de store gehouden zodat ze los te testen zijn. */
export function selectStatus(state: ProgressState, roadmapId: string, nodeId: string): NodeStatus {
  return state.nodes[nodeKey(roadmapId, nodeId)]?.value ?? 'todo';
}

export function selectNote(state: ProgressState, roadmapId: string, nodeId: string): string {
  return state.notes[nodeKey(roadmapId, nodeId)]?.value ?? '';
}

export function selectResourceRead(
  state: ProgressState,
  roadmapId: string,
  nodeId: string,
  resourceId: string
): boolean {
  return state.resources[resourceKey(roadmapId, nodeId, resourceId)]?.value ?? false;
}

export function selectCard(
  state: ProgressState,
  roadmapId: string,
  nodeId: string,
  cardId: string
): CardReview | undefined {
  return state.cards[resourceKey(roadmapId, nodeId, cardId)]?.value;
}

export function selectStreak(state: ProgressState) {
  return computeStreak(state.activity);
}
