/**
 * Waar de terminalversie zijn spullen bewaart en waar hij de leerpaden vandaan
 * haalt. Bewust dezelfde bestandsvormen als de grafische app: de synchronisatie
 * praat met dezelfde documenten, dus je pc, je telefoon en je terminal komen op
 * hetzelfde uit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Volgt de gewoonte van het besturingssysteem, zodat niemand rommel in zijn home krijgt. */
export function configDir() {
  if (process.env.PATHFINDER_HOME) return path.resolve(process.env.PATHFINDER_HOME);
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Pathfinder');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Pathfinder');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'pathfinder');
}

export const paths = {
  get config() {
    return configDir();
  },
  get progress() {
    return path.join(configDir(), 'progress.json');
  },
  get library() {
    return path.join(configDir(), 'roadmaps.json');
  },
  get settings() {
    return path.join(configDir(), 'settings.json');
  },
  get secrets() {
    return path.join(configDir(), 'secrets.json');
  },
  /** Content die uit je eigen repository is opgehaald. */
  get pulledContent() {
    return path.join(configDir(), 'content');
  },
  /** Content die naast de app staat. */
  get bundledContent() {
    return path.join(ROOT, 'content');
  },
};

/**
 * Opgehaalde content wint van wat er naast de app staat, net als in de grafische
 * app: anders zie je een leerpad dat je op je telefoon maakte hier nooit terug.
 */
export function contentDir() {
  if (process.env.PATHFINDER_CONTENT) return path.resolve(process.env.PATHFINDER_CONTENT);
  if (fs.existsSync(path.join(paths.pulledContent, 'manifest.json'))) return paths.pulledContent;
  return paths.bundledContent;
}

export function ensureConfigDir() {
  fs.mkdirSync(configDir(), { recursive: true });
}
