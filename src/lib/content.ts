import type {
  ContentManifest,
  DocumentCollection,
  Roadmap,
} from '@/types';
import { kvGet, kvSet } from './storage';
import { getRawFile, type RepoRef } from './github';

/**
 * Content komt uit twee bronnen:
 *
 * 1. de bestanden die met de app zijn meegeleverd (dist/content), en
 * 2. de nieuwste versie uit de GitHub-repo.
 *
 * Daardoor kan er een leerpad bijkomen zonder dat er een nieuwe app-versie
 * uitgebracht hoeft te worden: bestand toevoegen, manifest opnieuw genereren,
 * pushen, en beide apparaten halen het bij de volgende sync op.
 */

const CACHE_MANIFEST = 'content:remote-manifest';
const CACHE_FILE_PREFIX = 'content:file:';

function contentUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(`content/${path}`, base).toString();
}

async function fetchBundled(path: string): Promise<string> {
  const response = await fetch(contentUrl(path), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Kon ${path} niet laden (${response.status}).`);
  return response.text();
}

let activeManifest: ContentManifest | null = null;
let bundledManifest: ContentManifest | null = null;

export async function loadManifest(force = false): Promise<ContentManifest> {
  if (activeManifest && !force) return activeManifest;

  bundledManifest = JSON.parse(await fetchBundled('manifest.json')) as ContentManifest;
  const cached = await kvGet<ContentManifest>(CACHE_MANIFEST);

  // De gecachete versie telt alleen als hij nieuwer is dan wat er is meegeleverd;
  // na een app-update is de meegeleverde content vaak juist de recentste.
  const useCached =
    cached &&
    cached.contentVersion !== bundledManifest.contentVersion &&
    Date.parse(cached.generatedAt) > Date.parse(bundledManifest.generatedAt);

  activeManifest = useCached ? cached : bundledManifest;
  return activeManifest;
}

export function getBundledManifest(): ContentManifest | null {
  return bundledManifest;
}

async function loadFile(path: string): Promise<string> {
  const manifest = await loadManifest();
  if (manifest !== bundledManifest) {
    const cached = await kvGet<string>(`${CACHE_FILE_PREFIX}${path}`);
    if (typeof cached === 'string') return cached;
  }
  return fetchBundled(path);
}

const roadmapCache = new Map<string, Roadmap>();

export async function loadRoadmap(id: string): Promise<Roadmap> {
  const cached = roadmapCache.get(id);
  if (cached) return cached;

  const manifest = await loadManifest();
  const summary = manifest.roadmaps.find((entry) => entry.id === id);
  if (!summary) throw new Error(`Leerpad "${id}" bestaat niet.`);

  const roadmap = JSON.parse(await loadFile(summary.path)) as Roadmap;
  roadmapCache.set(id, roadmap);
  return roadmap;
}

/** Pad van een markdown-bestand binnen een leerpadmap, bijv. nodes/scope.md. */
export async function loadRoadmapBody(roadmapId: string, body: string): Promise<string> {
  return loadFile(`roadmaps/${roadmapId}/${body}`);
}

const collectionCache = new Map<string, DocumentCollection>();

export async function loadCollection(id: string): Promise<DocumentCollection> {
  const cached = collectionCache.get(id);
  if (cached) return cached;

  const manifest = await loadManifest();
  const entry = manifest.collections.find((collection) => collection.id === id);
  if (!entry) throw new Error(`Documentenverzameling "${id}" bestaat niet.`);

  const collection = JSON.parse(await loadFile(entry.path)) as DocumentCollection;
  collectionCache.set(id, collection);
  return collection;
}

export interface ParsedDocument {
  meta: Record<string, string>;
  body: string;
}

/** Leest de front matter die de conversie bovenaan elk document zet. */
export function parseFrontMatter(text: string): ParsedDocument {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };

  const meta: Record<string, string> = {};
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

export async function loadDocument(collectionId: string, documentId: string): Promise<ParsedDocument> {
  const collection = await loadCollection(collectionId);
  const doc = collection.documents.find((entry) => entry.id === documentId);
  if (!doc?.docPath) throw new Error(`Document "${documentId}" bestaat niet.`);
  return parseFrontMatter(await loadFile(doc.docPath));
}

export interface ContentUpdateResult {
  updated: boolean;
  changedFiles: number;
  contentVersion: string;
}

/**
 * Haalt de content uit de repo op als die verschilt van wat de app nu gebruikt.
 * Alleen bestanden waarvan de hash afwijkt worden gedownload, zodat een sync na
 * het toevoegen van een leerpad een paar kilobytes kost in plaats van megabytes.
 */
export async function pullContentFromGitHub(
  token: string,
  ref: RepoRef,
  onProgress?: (done: number, total: number) => void
): Promise<ContentUpdateResult> {
  const current = await loadManifest();
  const remote = JSON.parse(await getRawFile(token, ref, 'content/manifest.json')) as ContentManifest;

  if (remote.contentVersion === current.contentVersion) {
    return { updated: false, changedFiles: 0, contentVersion: current.contentVersion };
  }

  const currentHashes = new Map(current.files.map((file) => [file.path, file.hash]));
  const changed = remote.files.filter((file) => currentHashes.get(file.path) !== file.hash);

  let done = 0;
  onProgress?.(0, changed.length);

  // Drie tegelijk: snel genoeg, en ver onder de secundaire limieten van GitHub.
  const queue = [...changed];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      const text = await getRawFile(token, ref, `content/${file.path}`);
      await kvSet(`${CACHE_FILE_PREFIX}${file.path}`, text);
      done += 1;
      onProgress?.(done, changed.length);
    }
  });
  await Promise.all(workers);

  await kvSet(CACHE_MANIFEST, remote);
  activeManifest = remote;
  roadmapCache.clear();
  collectionCache.clear();

  return { updated: true, changedFiles: changed.length, contentVersion: remote.contentVersion };
}

export function clearContentCaches(): void {
  roadmapCache.clear();
  collectionCache.clear();
  activeManifest = null;
}
