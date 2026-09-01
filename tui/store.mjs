/**
 * De gegevens van de terminalversie op schijf: je voortgang, je eigen leerpaden,
 * je instellingen en je token. Elk bestand heeft precies de vorm die de
 * grafische app ook synchroniseert.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ensureConfigDir, paths } from './paths.mjs';
import {
  NODE_STATUSES,
  cardKey,
  newCard,
  nodeKey,
  normalizeLibrary,
  normalizeProgress,
  resourceKey,
  reviewCard,
  stamp,
  today,
} from './progress.mjs';

export const DEFAULT_SYNC = {
  enabled: false,
  backend: 'github',
  owner: '',
  repo: 'pathfinder-data',
  branch: 'main',
  path: 'sync/progress.json',
  pullContent: true,
  serverUrl: '',
  autoSyncMinutes: 10,
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // Ontbreekt of is stuk: beginnen met niets is beter dan niet starten.
    return fallback;
  }
}

/** Eerst schrijven, dan omwisselen: een onderbroken schrijfactie laat niets halfs achter. */
function writeJson(file, value, mode) {
  ensureConfigDir();
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : undefined);
  fs.renameSync(temporary, file);
}

export function createStore() {
  const state = {
    progress: normalizeProgress(readJson(paths.progress, null)),
    library: normalizeLibrary(readJson(paths.library, null)),
    settings: { theme: 'dark', ...readJson(paths.settings, {}) },
  };
  state.settings.sync = { ...DEFAULT_SYNC, ...(state.settings.sync ?? {}) };

  const saveProgress = () => writeJson(paths.progress, state.progress);
  const saveLibrary = () => writeJson(paths.library, state.library);
  const saveSettings = () => writeJson(paths.settings, state.settings);

  /** Eén plek waar voortgang verandert, zodat de dagteller nergens vergeten wordt. */
  function update(mutate, countsAsActivity = false) {
    mutate(state.progress);
    if (countsAsActivity) {
      const day = today();
      state.progress.activity[day] = (state.progress.activity[day] ?? 0) + 1;
    }
    saveProgress();
  }

  return {
    get progress() {
      return state.progress;
    },
    get library() {
      return state.library;
    },
    get settings() {
      return state.settings;
    },
    get sync() {
      return state.settings.sync;
    },

    statusOf(roadmapId, nodeId) {
      return state.progress.nodes[nodeKey(roadmapId, nodeId)]?.value ?? 'todo';
    },

    noteOf(roadmapId, nodeId) {
      return state.progress.notes[nodeKey(roadmapId, nodeId)]?.value ?? '';
    },

    isResourceRead(roadmapId, nodeId, resourceId) {
      return state.progress.resources[resourceKey(roadmapId, nodeId, resourceId)]?.value ?? false;
    },

    cardOf(roadmapId, nodeId, cardId) {
      return state.progress.cards[cardKey(roadmapId, nodeId, cardId)]?.value;
    },

    setStatus(roadmapId, nodeId, status) {
      const key = nodeKey(roadmapId, nodeId);
      const wasDone = state.progress.nodes[key]?.value === 'done';
      update(
        (draft) => {
          draft.nodes[key] = stamp(status);
        },
        status === 'done' && !wasDone
      );
    },

    cycleStatus(roadmapId, nodeId) {
      const current = this.statusOf(roadmapId, nodeId);
      const next = NODE_STATUSES[(NODE_STATUSES.indexOf(current) + 1) % NODE_STATUSES.length];
      this.setStatus(roadmapId, nodeId, next);
      return next;
    },

    setNote(roadmapId, nodeId, text) {
      const key = nodeKey(roadmapId, nodeId);
      update((draft) => {
        if (text.trim()) draft.notes[key] = stamp(text);
        else delete draft.notes[key];
      });
    },

    toggleResource(roadmapId, nodeId, resourceId) {
      const key = resourceKey(roadmapId, nodeId, resourceId);
      const next = !(state.progress.resources[key]?.value ?? false);
      update((draft) => {
        draft.resources[key] = stamp(next);
      });
      return next;
    },

    gradeCard(roadmapId, nodeId, cardId, grade) {
      const key = cardKey(roadmapId, nodeId, cardId);
      const existing = state.progress.cards[key]?.value ?? newCard();
      const reviewed = reviewCard(existing, grade);
      update((draft) => {
        draft.cards[key] = stamp(reviewed);
      }, true);
      return reviewed;
    },

    setTheme(id) {
      state.settings.theme = id;
      saveSettings();
    },

    setSync(patch) {
      state.settings.sync = { ...state.settings.sync, ...patch };
      saveSettings();
    },

    /** Na een synchronisatie: het samengevoegde resultaat is nu de waarheid. */
    replaceProgress(next) {
      state.progress = normalizeProgress(next);
      saveProgress();
    },

    replaceLibrary(next) {
      state.library = normalizeLibrary(next);
      saveLibrary();
    },

    // -----------------------------------------------------------------------
    // Token
    // -----------------------------------------------------------------------

    /**
     * Zonder bureaubladsessie is er geen sleutelbos om dit in te zetten, en een
     * eigen versleuteling met de sleutel ernaast is schijnveiligheid. Het bestand
     * is daarom leesbaar, maar alleen voor jou.
     */
    readToken(backend = state.settings.sync.backend) {
      const secrets = readJson(paths.secrets, {});
      return secrets[`${backend}-token`] ?? '';
    },

    writeToken(token, backend = state.settings.sync.backend) {
      const secrets = readJson(paths.secrets, {});
      const key = `${backend}-token`;
      if (token) secrets[key] = token;
      else delete secrets[key];
      writeJson(paths.secrets, secrets, 0o600);
    },

    get secretsFile() {
      return paths.secrets;
    },

    get files() {
      return {
        config: paths.config,
        progress: path.basename(paths.progress),
        library: path.basename(paths.library),
      };
    },
  };
}
