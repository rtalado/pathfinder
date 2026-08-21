/**
 * Zet de versie uit package.json in het Android-project. Android heeft naast een
 * leesbare versienaam een oplopend versienummer nodig; zonder ophoging weigert
 * het toestel de nieuwe APK als update te installeren.
 *
 * Gebruik: node scripts/set-android-version.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');

const { version } = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const [major = 0, minor = 0, patch = 0] = version
  .split('.')
  .map((part) => Number.parseInt(part, 10) || 0);

// 1.2.3 wordt 10203: altijd oplopend zolang minor en patch onder de honderd blijven.
const versionCode = major * 10_000 + minor * 100 + patch;

let gradle = await fs.readFile(GRADLE, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
await fs.writeFile(GRADLE, gradle, 'utf8');

console.log(`Android: versionName ${version}, versionCode ${versionCode}`);
