/**
 * De leerpaden en documenten van schijf lezen. De grafische app haalt deze
 * bestanden met fetch() op; hier komen ze rechtstreeks uit de map die
 * paths.contentDir() aanwijst.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentDir } from './paths.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadManifest() {
  const file = path.join(contentDir(), 'manifest.json');
  if (!fs.existsSync(file)) {
    return { contentVersion: 'leeg', generatedAt: null, roadmaps: [], collections: [], files: [] };
  }
  return readJson(file);
}

/** De leerpaden die je zelf hebt toegevoegd; verwijderde staan er als null in. */
export function libraryRoadmaps(library) {
  return Object.values(library.roadmaps ?? {})
    .map((entry) => entry.value)
    .filter(Boolean);
}

/**
 * Alles wat je kunt openen: wat er is meegeleverd plus wat je zelf toevoegde.
 * Een eigen leerpad met hetzelfde id wint, net als in de app.
 */
export function listRoadmaps(manifest, library) {
  const own = libraryRoadmaps(library);
  const ownIds = new Set(own.map((roadmap) => roadmap.id));

  const bundled = manifest.roadmaps
    .filter((summary) => !ownIds.has(summary.id))
    .map((summary) => ({
      id: summary.id,
      title: summary.title,
      subtitle: summary.subtitle,
      color: summary.color,
      order: summary.order,
      source: 'bundled',
      path: summary.path,
    }));

  const mine = own.map((roadmap) => ({
    id: roadmap.id,
    title: roadmap.title,
    subtitle: roadmap.subtitle,
    color: roadmap.color,
    order: roadmap.order,
    source: 'user',
    roadmap,
  }));

  return [...bundled, ...mine].sort(
    (a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title)
  );
}

const roadmapCache = new Map();

export function loadRoadmap(entry) {
  if (entry.source === 'user') return entry.roadmap;
  const cached = roadmapCache.get(entry.id);
  if (cached) return cached;
  const roadmap = readJson(path.join(contentDir(), entry.path));
  roadmapCache.set(entry.id, roadmap);
  return roadmap;
}

/** De tekst van een onderwerp: uit het leerpad zelf, of uit een los bestand. */
export function loadNodeBody(roadmapId, node) {
  if (node.content) return node.content;
  if (!node.body) return '';
  const file = path.join(contentDir(), 'roadmaps', roadmapId, node.body);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return `_De tekst bij dit onderwerp is niet gevonden (${node.body})._`;
  }
}

export function loadCollection(manifest, id) {
  const entry = manifest.collections.find((collection) => collection.id === id);
  if (!entry) return null;
  return readJson(path.join(contentDir(), entry.path));
}

export function loadDocument(doc) {
  if (!doc?.docPath) return { meta: {}, body: '_Dit document is niet omgezet._' };
  try {
    return parseFrontMatter(fs.readFileSync(path.join(contentDir(), doc.docPath), 'utf8'));
  } catch {
    return { meta: {}, body: '_Dit document staat niet in deze map._' };
  }
}

/** Leest de front matter die de conversie bovenaan elk document zet. */
export function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    try {
      meta[key] = typeof JSON.parse(raw) === 'string' ? JSON.parse(raw) : raw;
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// Structuur van een leerpad
// ---------------------------------------------------------------------------

/**
 * De nodes op leesvolgorde, met hun diepte. De graph van de app wordt hier een
 * boom: fases, daaronder onderwerpen, daaronder details. Een node zonder ouder
 * die geen fase is, komt onderaan te staan in plaats van te verdwijnen.
 */
export function outline(roadmap) {
  const byParent = new Map();
  for (const node of roadmap.nodes) {
    const key = node.parent ?? '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }

  const rows = [];
  const seen = new Set();

  const walk = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    rows.push({ node, depth });
    for (const child of byParent.get(node.id) ?? []) walk(child, depth + 1);
  };

  for (const node of roadmap.nodes.filter((entry) => entry.kind === 'milestone')) walk(node, 0);
  // Wat nergens aan hangt hoort er ook bij; anders is het onzichtbaar.
  for (const node of roadmap.nodes) if (!seen.has(node.id)) walk(node, node.parent ? 1 : 0);

  return rows;
}

/** Onderwerpen tellen mee voor de voortgang; een label is alleen toelichting. */
export const countsForProgress = (node) => node.kind !== 'label';

export function roadmapProgress(roadmap, store) {
  const nodes = roadmap.nodes.filter(countsForProgress);
  const done = nodes.filter((node) => store.statusOf(roadmap.id, node.id) === 'done').length;
  return { done, total: nodes.length, percent: nodes.length ? done / nodes.length : 0 };
}

/** Alle kaarten van een leerpad, met de sleutel waaronder hun voortgang staat. */
export function collectCards(roadmap) {
  const cards = [];
  for (const node of roadmap.nodes) {
    for (const card of node.flashcards ?? []) {
      cards.push({ roadmapId: roadmap.id, nodeId: node.id, nodeTitle: node.title, card });
    }
  }
  return cards;
}
