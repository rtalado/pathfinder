/**
 * Controleert shared/themes.json, het palet dat de app en de terminalversie
 * allebei lezen. Een thema dat een kleur mist geeft in de app een onzichtbare
 * knop en in de terminal een lege plek, en dat merk je pas als je hem opzet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'shared', 'themes.json');

const { themes } = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = [];

if (!Array.isArray(themes) || themes.length === 0) {
  problems.push('er staat geen enkel thema in shared/themes.json');
}

const expected = Object.keys(themes[0]?.colors ?? {});
const seen = new Set();

for (const theme of themes ?? []) {
  const where = theme.id ?? '(zonder id)';
  for (const field of ['id', 'name', 'description']) {
    if (!theme[field]) problems.push(`${where}: ${field} ontbreekt`);
  }
  if (typeof theme.dark !== 'boolean') problems.push(`${where}: dark moet true of false zijn`);
  if (typeof theme.mono !== 'boolean') problems.push(`${where}: mono moet true of false zijn`);
  if (seen.has(theme.id)) problems.push(`${where}: dit id komt twee keer voor`);
  seen.add(theme.id);

  const missing = expected.filter((key) => !(key in (theme.colors ?? {})));
  if (missing.length) problems.push(`${where}: mist ${missing.join(', ')}`);

  for (const [key, value] of Object.entries(theme.colors ?? {})) {
    // graphBase mag leeg zijn: dan houdt een leerpad zijn eigen kleur.
    if (value === null && key === 'graphBase') continue;
    if (key === 'shadowRgb') {
      if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(String(value))) {
        problems.push(`${where}: shadowRgb moet "r g b" zijn, niet "${value}"`);
      }
      continue;
    }
    if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(value))) {
      problems.push(`${where}: ${key} is geen hexkleur ("${value}")`);
    }
  }
}

// 'system' is in de app geen thema maar een keuze; een thema dat zo heet zou
// die keuze overschrijven.
if (seen.has('system')) problems.push('een thema mag niet "system" heten');

if (problems.length) {
  console.error('Er klopt iets niet aan de themas:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`${themes.length} themas in orde: ${themes.map((theme) => theme.id).join(', ')}`);
