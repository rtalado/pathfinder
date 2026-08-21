/**
 * Bouwt content/manifest.json: de inhoudsopgave van alle leerpaden en documenten,
 * met een hash per bestand. De app gebruikt dat manifest om te zien of er iets
 * veranderd is en om alleen de gewijzigde bestanden op te halen.
 *
 * Draait automatisch voor elke build; handmatig via: npm run content:index
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.resolve(ROOT, 'content');
const MANIFEST_PATH = path.join(CONTENT_DIR, 'manifest.json');

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function hash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
}

async function main() {
  // Het manifest zelf en de toelichting horen niet bij de content die de app ophaalt.
  const skip = new Set([MANIFEST_PATH, path.join(CONTENT_DIR, 'README.md')]);
  const files = (await walk(CONTENT_DIR)).filter((file) => !skip.has(file)).sort();

  const entries = [];
  for (const file of files) {
    const buffer = await fs.readFile(file);
    entries.push({
      path: path.relative(CONTENT_DIR, file).split(path.sep).join('/'),
      hash: hash(buffer),
      size: buffer.length,
    });
  }

  const roadmaps = [];
  for (const entry of entries) {
    if (!/^roadmaps\/[^/]+\/roadmap\.json$/.test(entry.path)) continue;
    const roadmap = JSON.parse(await fs.readFile(path.join(CONTENT_DIR, entry.path), 'utf8'));
    const folder = entry.path.split('/')[1];
    if (roadmap.id !== folder) {
      console.warn(`  ! ${entry.path}: id "${roadmap.id}" wijkt af van mapnaam "${folder}".`);
    }
    roadmaps.push({
      id: roadmap.id,
      title: roadmap.title,
      subtitle: roadmap.subtitle ?? null,
      icon: roadmap.icon ?? null,
      color: roadmap.color ?? null,
      version: roadmap.version ?? 1,
      order: roadmap.order ?? 99,
      nodeCount: Array.isArray(roadmap.nodes) ? roadmap.nodes.length : 0,
      path: entry.path,
    });
  }
  roadmaps.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const collections = [];
  for (const entry of entries) {
    if (!/^docs\/[^/]+\/index\.json$/.test(entry.path)) continue;
    const collection = JSON.parse(await fs.readFile(path.join(CONTENT_DIR, entry.path), 'utf8'));
    collections.push({
      id: collection.collection,
      title: collection.title,
      path: entry.path,
      documentCount: collection.documents?.length ?? 0,
    });
  }

  // Een hash over alle bestandshashes: verandert precies dan wanneer er iets wijzigt.
  const contentVersion = hash(entries.map((entry) => `${entry.path}:${entry.hash}`).join('\n'));

  const previous = await fs
    .readFile(MANIFEST_PATH, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);

  // generatedAt alleen verzetten als er echt iets veranderd is, anders geeft elke
  // build een "nieuwe" content-versie en gaan apparaten onnodig downloaden.
  const generatedAt =
    previous?.contentVersion === contentVersion ? previous.generatedAt : new Date().toISOString();

  const manifest = { contentVersion, generatedAt, roadmaps, collections, files: entries };
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    `manifest.json: ${roadmaps.length} leerpad(en), ${collections.length} verzameling(en), ` +
      `${entries.length} bestand(en), versie ${contentVersion}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
