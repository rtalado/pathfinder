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

/**
 * De ondertekening. Capacitor genereert build.gradle zonder sleutel, en zonder
 * sleutel levert een release-build een APK op die Android weigert te installeren.
 * Deze blokken zetten we erin als ze ontbreken, zodat het ook klopt in een project
 * dat net met "npx cap add android" is aangemaakt.
 */
const SIGNING_CONFIG = `    // De sleutel komt uit omgevingsvariabelen, zodat hij niet in de repository staat.
    // Zonder sleutel valt de build terug op de debug-sleutel; die is prima om te
    // testen, maar Android weigert een update als de sleutel tussentijds wijzigt.
    signingConfigs {
        release {
            def keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
`;

const SIGNING_LINE = `            signingConfig System.getenv("ANDROID_KEYSTORE_PATH")
                ? signingConfigs.release
                : signingConfigs.debug
`;

let gradle = await fs.readFile(GRADLE, 'utf8');

gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(/^(\s*)buildTypes\s*\{/m, `${SIGNING_CONFIG}$1buildTypes {`);
  console.log('Android: ondertekeningsconfiguratie toegevoegd.');
}

if (!gradle.includes('signingConfig ')) {
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{[^}]*proguardFiles[^\n]*\n)/,
    `$1${SIGNING_LINE}`
  );
}

await fs.writeFile(GRADLE, gradle, 'utf8');

console.log(`Android: versionName ${version}, versionCode ${versionCode}`);
