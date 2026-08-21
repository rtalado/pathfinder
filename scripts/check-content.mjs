/**
 * Controleert alle leerpaden voordat je ze pusht: kloppen de verwijzingen, staan
 * alle markdown-bestanden er, en zijn er nodes zonder ouder of dubbele ids?
 *
 * Gebruik: npm run content:check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAPS = path.join(ROOT, 'content', 'roadmaps');
const DOCS = path.join(ROOT, 'content', 'docs');

const problems = [];
const notes = [];

/** Alle documenten uit alle verzamelingen, als "collectie/id". */
function loadDocumentIds() {
  const ids = new Set();
  if (!fs.existsSync(DOCS)) return ids;
  for (const collection of fs.readdirSync(DOCS)) {
    const indexPath = path.join(DOCS, collection, 'index.json');
    if (!fs.existsSync(indexPath)) continue;
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    for (const doc of index.documents ?? []) ids.add(`${index.collection}/${doc.id}`);
  }
  return ids;
}

const documentIds = loadDocumentIds();
const VALID_KINDS = new Set(['milestone', 'topic', 'subtopic', 'label']);

if (!fs.existsSync(ROADMAPS)) {
  console.error(`Geen leerpaden gevonden in ${ROADMAPS}`);
  process.exit(1);
}

let totalNodes = 0;
let totalCards = 0;

for (const folder of fs.readdirSync(ROADMAPS)) {
  const base = path.join(ROADMAPS, folder);
  const file = path.join(base, 'roadmap.json');
  const label = `roadmaps/${folder}`;

  if (!fs.existsSync(file)) {
    problems.push(`${label}: roadmap.json ontbreekt`);
    continue;
  }

  let roadmap;
  try {
    roadmap = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: roadmap.json is geen geldige JSON (${error.message})`);
    continue;
  }

  if (roadmap.id !== folder) {
    problems.push(`${label}: id "${roadmap.id}" komt niet overeen met de mapnaam`);
  }
  if (!roadmap.title) problems.push(`${label}: titel ontbreekt`);
  if (!Array.isArray(roadmap.nodes) || roadmap.nodes.length === 0) {
    problems.push(`${label}: geen nodes`);
    continue;
  }

  const ids = new Set();
  const milestones = roadmap.nodes.filter((node) => node.kind === 'milestone');
  if (milestones.length === 0) problems.push(`${label}: geen enkele milestone`);

  for (const node of roadmap.nodes) {
    const where = `${label}/${node.id ?? '(zonder id)'}`;

    if (!node.id) problems.push(`${where}: node zonder id`);
    else if (ids.has(node.id)) problems.push(`${where}: dubbele node-id`);
    else ids.add(node.id);

    if (!node.title) problems.push(`${where}: titel ontbreekt`);
    if (!VALID_KINDS.has(node.kind)) problems.push(`${where}: onbekend type "${node.kind}"`);

    if (node.body) {
      const bodyPath = path.join(base, node.body);
      if (!fs.existsSync(bodyPath)) problems.push(`${where}: ${node.body} bestaat niet`);
    } else if (node.kind !== 'label' && !node.summary) {
      notes.push(`${where}: geen uitleg en geen samenvatting`);
    }

    for (const link of node.docs ?? []) {
      if (!documentIds.has(`${link.collection}/${link.id}`)) {
        problems.push(`${where}: document "${link.collection}/${link.id}" bestaat niet`);
      }
    }

    const cardIds = new Set();
    for (const card of node.flashcards ?? []) {
      if (!card.id || !card.question || !card.answer) {
        problems.push(`${where}: onvolledige flashcard`);
      } else if (cardIds.has(card.id)) {
        problems.push(`${where}: dubbele flashcard-id "${card.id}"`);
      } else {
        cardIds.add(card.id);
      }
    }
    totalCards += node.flashcards?.length ?? 0;
  }

  // Ouders moeten bestaan; anders verdwijnt een node uit de graph.
  for (const node of roadmap.nodes) {
    if (node.parent && !ids.has(node.parent)) {
      problems.push(`${label}/${node.id}: ouder "${node.parent}" bestaat niet`);
    }
    if (node.kind !== 'milestone' && !node.parent) {
      notes.push(`${label}/${node.id}: geen ouder, komt onderaan te hangen`);
    }
  }

  // Markdown-bestanden waar geen node naar verwijst.
  const nodesDir = path.join(base, 'nodes');
  if (fs.existsSync(nodesDir)) {
    const used = new Set(roadmap.nodes.map((node) => node.body).filter(Boolean));
    for (const fileName of fs.readdirSync(nodesDir)) {
      if (!used.has(`nodes/${fileName}`)) notes.push(`${label}: nodes/${fileName} wordt niet gebruikt`);
    }
  }

  totalNodes += roadmap.nodes.length;
  console.log(
    `${roadmap.id.padEnd(12)} ${String(roadmap.nodes.length).padStart(3)} onderwerpen, ` +
      `${milestones.length} fasen, ${roadmap.nodes.reduce((s, n) => s + (n.flashcards?.length ?? 0), 0)} kaarten`
  );
}

console.log(`\n${totalNodes} onderwerpen en ${totalCards} flashcards in totaal.`);

if (notes.length) {
  console.log(`\nAandachtspunten (${notes.length}):`);
  for (const note of notes) console.log(`  - ${note}`);
}

if (problems.length) {
  console.error(`\nFouten (${problems.length}):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(1);
}

console.log('\nAlles in orde.');
