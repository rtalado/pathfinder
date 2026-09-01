/**
 * Dezelfde regels als src/lib/progress.ts en src/lib/srs.ts. Ze staan hier apart
 * omdat de app TypeScript voor de browser is en dit gewoon Node; de vorm van de
 * gegevens moet identiek blijven, anders lopen twee apparaten uit elkaar.
 */

export const PROGRESS_SCHEMA = 1;
export const LIBRARY_SCHEMA = 1;

export const NODE_STATUSES = ['todo', 'doing', 'done', 'skipped'];

export const STATUS_LABELS = {
  todo: 'Te doen',
  doing: 'Mee bezig',
  done: 'Afgerond',
  skipped: 'Overgeslagen',
};

export function emptyProgress() {
  return { schema: PROGRESS_SCHEMA, nodes: {}, notes: {}, resources: {}, cards: {}, activity: {} };
}

export function emptyLibrary() {
  return { schema: LIBRARY_SCHEMA, roadmaps: {} };
}

export function isProgressEmpty(state) {
  return (
    Object.keys(state.nodes).length === 0 &&
    Object.keys(state.notes).length === 0 &&
    Object.keys(state.resources).length === 0 &&
    Object.keys(state.cards).length === 0 &&
    Object.keys(state.activity).length === 0
  );
}

export function isLibraryEmpty(library) {
  return Object.keys(library.roadmaps).length === 0;
}

export const nodeKey = (roadmapId, nodeId) => `${roadmapId}/${nodeId}`;
export const resourceKey = (roadmapId, nodeId, resourceId) => `${roadmapId}/${nodeId}/${resourceId}`;
export const cardKey = (roadmapId, nodeId, cardId) => `${roadmapId}/${nodeId}/${cardId}`;

export const stamp = (value, at = Date.now()) => ({ value, updatedAt: at });

/** Lokale datum, niet UTC: een streak hoort bij de dag zoals jij hem beleeft. */
export function today(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function normalizeProgress(input) {
  const base = emptyProgress();
  if (!input || typeof input !== 'object') return base;
  return {
    schema: PROGRESS_SCHEMA,
    nodes: input.nodes ?? {},
    notes: input.notes ?? {},
    resources: input.resources ?? {},
    cards: input.cards ?? {},
    activity: input.activity ?? {},
  };
}

export function normalizeLibrary(input) {
  if (!input || typeof input !== 'object') return emptyLibrary();
  const roadmaps = {};
  for (const [id, entry] of Object.entries(input.roadmaps ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
    // Een grafsteen (null) blijft staan, anders zet het andere apparaat een
    // verwijderd leerpad bij de volgende synchronisatie gewoon terug.
    if (entry.value === null || (entry.value && Array.isArray(entry.value.nodes))) {
      roadmaps[id] = { value: entry.value, updatedAt };
    }
  }
  return { schema: LIBRARY_SCHEMA, roadmaps };
}

/** Per sleutel wint de meest recente wijziging. */
export function mergeRecords(local, remote) {
  const merged = { ...local };
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

export function mergeProgress(local, remote) {
  const nodes = mergeRecords(local.nodes, remote.nodes ?? {});
  const notes = mergeRecords(local.notes, remote.notes ?? {});
  const resources = mergeRecords(local.resources, remote.resources ?? {});
  const cards = mergeRecords(local.cards, remote.cards ?? {});

  // Activiteit is een teller per dag; het hoogste getal is het volledigste beeld.
  const activity = { ...local.activity };
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

export function mergeLibrary(local, remote) {
  const merged = mergeRecords(local.roadmaps, remote.roadmaps ?? {});
  return {
    state: { schema: LIBRARY_SCHEMA, roadmaps: merged.merged },
    pulled: merged.pulled,
    pushed: merged.pushed,
  };
}

export function computeStreak(activity) {
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
  let previous = null;
  for (const day of days) {
    const date = new Date(`${day}T00:00:00`);
    const isNext = previous !== null && Math.round((date - previous) / 86_400_000) === 1;
    run = isNext ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  // Telt terug vanaf vandaag, of vanaf gisteren als je vandaag nog niets deed;
  // anders breekt de streak elke nacht om twaalf uur.
  let current = 0;
  const cursor = new Date(`${todayKey}T00:00:00`);
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  while (set.has(today(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest, activeToday };
}

// ---------------------------------------------------------------------------
// Overhoren: vereenvoudigde SM-2, gelijk aan src/lib/srs.ts
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const MIN_EASE = 1.3;

export function newCard(now = Date.now()) {
  return { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewedAt: 0 };
}

export function reviewCard(card, grade, now = Date.now()) {
  if (grade === 'again') {
    return {
      ...card,
      due: now + 10 * 60_000,
      interval: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      reps: 0,
      lapses: card.lapses + 1,
      lastReviewedAt: now,
    };
  }

  const ease = grade === 'hard' ? Math.max(MIN_EASE, card.ease - 0.15) : card.ease + 0.05;
  let interval;
  if (card.reps === 0) interval = grade === 'hard' ? 1 : 2;
  else if (card.reps === 1) interval = grade === 'hard' ? 3 : 6;
  else interval = Math.round(card.interval * (grade === 'hard' ? 1.2 : ease));

  interval = Math.max(1, Math.min(interval, 365));

  return {
    due: now + interval * DAY,
    interval,
    ease,
    reps: card.reps + 1,
    lapses: card.lapses,
    lastReviewedAt: now,
  };
}

export const isDue = (card, now = Date.now()) => !card || card.due <= now;

export function describeInterval(card) {
  if (card.interval === 0) return 'straks weer';
  if (card.interval === 1) return 'morgen';
  if (card.interval < 30) return `over ${card.interval} dagen`;
  const months = Math.round(card.interval / 30);
  return months === 1 ? 'over een maand' : `over ${months} maanden`;
}
