#!/usr/bin/env node
/**
 * Pathfinder in de terminal.
 *
 *   npm run tui                 starten
 *   npm run tui -- --thema nord met een ander thema beginnen
 *   npm run tui -- --themas     laat zien welke thema's er zijn
 *
 * De voortgang staat in je eigen configuratiemap en synchroniseert met dezelfde
 * repository of server als de grafische app.
 */
import { createApp } from './app.mjs';
import { THEMES, findTheme } from './theme.mjs';
import { contentDir, paths } from './paths.mjs';

function argument(...names) {
  for (const name of names) {
    const index = process.argv.indexOf(name);
    if (index !== -1) return process.argv[index + 1] ?? true;
  }
  return null;
}

const has = (...names) => names.some((name) => process.argv.includes(name));

if (has('--help', '-h')) {
  console.log(`Pathfinder in de terminal

  pathfinder                  start de app
  pathfinder --thema <naam>   start met een bepaald thema
  pathfinder --themas         toont alle thema's
  pathfinder --waar           toont waar je gegevens en leerpaden staan

Toetsen: pijltjes bewegen, enter opent, spatie zet de status om,
? toont alle toetsen, q stopt.`);
  process.exit(0);
}

if (has('--themas', '--themes')) {
  for (const theme of THEMES) {
    console.log(`${theme.id.padEnd(10)} ${theme.name.padEnd(14)} ${theme.description}`);
  }
  process.exit(0);
}

if (has('--waar', '--where')) {
  console.log(`instellingen en voortgang: ${paths.config}`);
  console.log(`leerpaden:                 ${contentDir()}`);
  process.exit(0);
}

if (!process.stdout.isTTY) {
  console.error('Deze app heeft een echte terminal nodig; hij kan niet naar een bestand schrijven.');
  process.exit(1);
}

const wanted = argument('--thema', '--theme');
const app = createApp({
  theme: typeof wanted === 'string' ? findTheme(wanted).id : undefined,
  onExit: () => process.exit(0),
});

// Wat er ook misgaat: eerst de terminal teruggeven, anders zit de gebruiker met
// een onzichtbare cursor in een halfgetekend scherm.
const bail = (error) => {
  app.stop();
  console.error(error?.stack ?? String(error));
  process.exit(1);
};

process.on('uncaughtException', bail);
process.on('unhandledRejection', bail);
process.on('SIGINT', () => app.stop());
process.on('SIGTERM', () => app.stop());

app.start();
