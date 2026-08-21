/**
 * Hulpmiddel bij het schrijven van leerpaden: splitst één bundelbestand in de
 * losse markdown-bestanden van een roadmap. Handig omdat de teksten van een
 * leerpad in samenhang geschreven worden, maar per node geladen moeten worden.
 *
 * Bundelformaat: elke regel die begint met "=== " start een nieuw bestand,
 * met daarachter het pad ten opzichte van de doelmap.
 *
 *   === nodes/basis.md
 *   # Wat IAM is
 *   ...
 *
 * Gebruik: node scripts/split-bundle.mjs <bundel> <doelmap>
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const [bundlePath, targetDir] = process.argv.slice(2);

if (!bundlePath || !targetDir) {
  console.error('Gebruik: node scripts/split-bundle.mjs <bundel> <doelmap>');
  process.exit(1);
}

const text = await fs.readFile(bundlePath, 'utf8');
const lines = text.split(/\r?\n/);

let current = null;
let buffer = [];
let written = 0;

async function flush() {
  if (!current) return;
  const target = path.resolve(targetDir, current);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${buffer.join('\n').trim()}\n`, 'utf8');
  written += 1;
}

for (const line of lines) {
  const marker = line.match(/^===\s+(.+?)\s*$/);
  if (marker) {
    await flush();
    current = marker[1];
    buffer = [];
    continue;
  }
  if (current) buffer.push(line);
}
await flush();

console.log(`${written} bestand(en) geschreven naar ${path.resolve(targetDir)}`);
