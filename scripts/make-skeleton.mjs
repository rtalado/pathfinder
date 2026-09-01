/**
 * Maakt een deelbare kopie van dit project: dezelfde app, zonder de persoonlijke
 * leerpaden en documenten, met een startleerpad dat uitlegt hoe het werkt.
 *
 * Wie de kopie krijgt, kan er zijn eigen versie van maken zonder iets van jou mee
 * te krijgen.
 *
 * Gebruik: node scripts/make-skeleton.mjs --out ../pathfinder-starter
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const OUT = path.resolve(ROOT, arg('out', '../pathfinder-starter'));

/** De publieke repository waar de releases vandaan komen. */
const REPO = arg('repo', 'rtalado/pathfinder');

/** Mapnamen die overal worden overgeslagen: gegenereerd of te groot. */
const SKIP_ANYWHERE = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'release']);

/** Paden die specifiek niet meegaan: persoonlijk, of opnieuw te genereren. */
const SKIP_PATHS = new Set([
  // Capacitor genereert dit opnieuw met npx cap add android.
  'android',
  // De persoonlijke leerpaden en documenten.
  'content/roadmaps',
  'content/docs',
]);

const SKIP_FILES = new Set([
  'content/manifest.json',
  '.env',
  'secrets.json',
  'release.keystore',
  'scripts/convert-docs.mjs',
]);

async function copyTree(from, to, relative = '') {
  const entries = await fs.readdir(from, { withFileTypes: true });
  await fs.mkdir(to, { recursive: true });

  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    const key = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_ANYWHERE.has(entry.name) || SKIP_PATHS.has(key)) continue;
      await copyTree(source, target, key);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(key)) continue;
      await fs.copyFile(source, target);
    }
  }
}

// ---------------------------------------------------------------------------
// Het startleerpad
// ---------------------------------------------------------------------------

const STARTER_NODES = {
  'zo-werkt-het.md': `# 1. Zo werkt Pathfinder

Een leerpad is een verzameling onderwerpen in de volgorde waarin je ze het beste leert. De gele blokken zijn fasen, de paarse de onderwerpen daarbinnen.

## Wat je ermee doet

- **Klik** op een blok om de uitleg te lezen.
- **Rechtsklik** op een blok om de status te wisselen: te doen, mee bezig, afgerond, overgeslagen.
- Rechtsboven wissel je tussen de kaartweergave en een lijst. Op een telefoon staat de lijst standaard aan.

Je voortgang wordt meteen bewaard. Zet je later synchronisatie aan, dan loopt hij gelijk met je andere apparaten.

## Waarom dit pad er staat

Dit is een voorbeeld. Zodra je je eigen leerpad hebt gemaakt, mag je het weghalen.
`,

  'eigen-pad.md': `# 2. Je eigen leerpad maken

Je hoeft niets te programmeren. Je laat een AI het schrijven en plakt het resultaat in de app.

## De stappen

1. Ga naar **Nieuw leerpad** in het menu.
2. Vul in wat je wilt leren, op welk niveau, en hoe uitgebreid.
3. Klik op **Prompt kopiëren**.
4. Plak die tekst in ChatGPT, Claude of Gemini. Een gratis account volstaat.
5. Kopieer het antwoord en plak het terug in de app.
6. Klik op **Leerpad toevoegen**.

Je hebt nu de structuur: alle fasen en onderwerpen, met per onderwerp een korte samenvatting.

## En dan de uitleg

De volledige uitleg past niet in één antwoord van een AI. Daarom haal je die er per fase bij: kies een fase, kopieer de opdracht, plak het antwoord terug. Je ziet in de balk hoeveel er al geschreven is.

Je kunt dit rustig verdelen over meerdere keren. Een leerpad werkt ook prima met alleen de samenvattingen.
`,

  'prompt.md': `# De prompt aanpassen

De opdracht die de app genereert is een gewone tekst. Je kunt hem in het chatvenster aanvullen voordat je hem verstuurt.

Wat vaak helpt:

- **Meer context geven.** "Ik werk als grafisch ontwerper en wil dit voor productvisualisatie" levert een ander pad op dan de kale vraag.
- **Iets uitsluiten.** "Sla animatie over, daar heb ik geen interesse in."
- **Om herziening vragen.** Vind je het resultaat te oppervlakkig, vraag dan: "maak fase 3 concreter en splits hem in meer onderwerpen".

## Wat je niet moet doen

Vragen om links naar cursussen of video's. Een AI verzint die met overtuiging, en dan staan er bronnen in je pad die niet bestaan. De opdracht vraagt er daarom expliciet om alleen bronnen te noemen waarvan de AI zeker is.
`,

  'zelf-schrijven.md': `# Zelf schrijven of aanpassen

Alles wat je importeert kun je ook met de hand maken. Een leerpad is één JSON-document.

Bij een zelf toegevoegd leerpad staat een knop om het naar je klembord te kopiëren. Plak het in een teksteditor, pas het aan, en plak het terug in de app: hetzelfde id betekent dat het oude wordt vervangen.

Zo kun je bijvoorbeeld:

- een onderwerp toevoegen dat de AI vergat
- de volgorde van fasen omzetten
- je eigen uitleg schrijven in plaats van die van de AI
- een leerpad doorgeven aan iemand anders

De volledige beschrijving van het formaat staat in content/README.md in dit project.
`,

  'sync.md': `# 3. Op meerdere apparaten

De app kan je voortgang en je eigen leerpaden gelijk houden tussen je computer en je telefoon. Je kiest zelf waar die gegevens heen gaan: naar een eigen privé repository op GitHub, of naar een klein programma dat je zelf draait op bijvoorbeeld een Raspberry Pi. In beide gevallen komt er geen dienst van iemand anders aan te pas.

## Via GitHub

1. Een GitHub-account.
2. Een **privé** repository, bijvoorbeeld met de naam pathfinder-data.
3. Een fine-grained token met toegang tot alleen die ene repository, met de rechten Contents: read and write.

Die drie vul je in bij **Instellingen**. Klik op Verbinding testen en zet de schakelaar aan. Doe hetzelfde op je andere apparaat.

## Via je eigen server

In de map server van dit project staat een programma van één bestand. Start het op de machine die aan blijft staan:

    node pathfinder-server.mjs

Hij toont een toegangssleutel. Vul in de app het adres van die machine in, plus de sleutel. Je gegevens verlaten je huis dan niet.

## Hoe het samenvoegt

Vink je op je telefoon iets af terwijl je pc uit staat, dan komt dat er vanzelf bij zodra die weer synchroniseert. Per onderwerp wint de meest recente wijziging; er gaat niets verloren.

Zonder synchronisatie werkt alles gewoon, alleen dan per apparaat.
`,

  'installeren.md': `# 4. Installeren en bijwerken

## Windows

Draai het installatiebestand en start de app daarna vanuit het startmenu. Er is geen opdrachtregel bij nodig.

De app kijkt bij het opstarten of er een nieuwere versie is en installeert die bij het afsluiten.

## Android

Er is geen Play Store bij betrokken; je installeert de APK zelf. Android vraagt daarbij eenmalig toestemming om apps uit deze bron te installeren.

Bij Instellingen, Bijwerken kun je controleren of er een nieuwere versie klaarstaat.

## Zelf bouwen

Wil je de app aanpassen, dan heb je Node.js nodig. De opdrachten staan in README.md. Voor Android voeg je het platform eerst toe met npx cap add android.
`,
};

const STARTER_ROADMAP = {
  id: 'start',
  title: 'Zo werkt Pathfinder',
  subtitle: 'Lees dit eerst, maak daarna je eigen leerpad',
  description:
    'Een kort pad dat uitlegt hoe de app werkt en hoe je met een AI je eigen leerpad maakt. Verwijder het gerust zodra je op weg bent.',
  icon: 'graduation-cap',
  color: '#8b5cf6',
  version: 1,
  order: 1,
  estimatedHours: 1,
  nodes: [
    {
      id: 'basis',
      title: '1. Zo werkt de app',
      kind: 'milestone',
      body: 'nodes/zo-werkt-het.md',
      summary: 'Fasen, onderwerpen, statussen en de twee weergaven.',
    },
    {
      id: 'basis-eigen-pad',
      title: 'Je eigen leerpad maken',
      kind: 'topic',
      parent: 'basis',
      body: 'nodes/eigen-pad.md',
      summary: 'In zes stappen, met een AI naar keuze. Programmeren is niet nodig.',
      flashcards: [
        {
          id: 'c1',
          question: 'Waarom haal je de uitleg per fase op in plaats van in één keer?',
          answer:
            'Omdat een compleet leerpad met alle teksten te lang is voor één antwoord van een AI. Het antwoord wordt dan halverwege afgekapt.\n\nPer fase blijft het binnen de perken, en je kunt het verdelen over meerdere momenten.',
        },
      ],
    },
    {
      id: 'basis-prompt',
      title: 'De opdracht aanpassen',
      kind: 'subtopic',
      parent: 'basis-eigen-pad',
      body: 'nodes/prompt.md',
      summary: 'Context toevoegen levert een beter pad op. En waarom je niet om links moet vragen.',
    },
    {
      id: 'basis-zelf',
      title: 'Zelf schrijven of aanpassen',
      kind: 'subtopic',
      parent: 'basis-eigen-pad',
      body: 'nodes/zelf-schrijven.md',
      summary: 'Een leerpad is één JSON-document dat je kunt exporteren, aanpassen en delen.',
    },
    {
      id: 'sync',
      title: '2. Op meerdere apparaten',
      kind: 'milestone',
      body: 'nodes/sync.md',
      summary: 'Voortgang gelijk houden tussen pc en telefoon via je eigen privé repository.',
      optional: true,
    },
    {
      id: 'installeren',
      title: '3. Installeren en bijwerken',
      kind: 'milestone',
      body: 'nodes/installeren.md',
      summary: 'Windows, Android, en wat je nodig hebt om zelf te bouwen.',
    },
  ],
};

const SKELETON_README = `# Pathfinder

Een leerpad-app in de stijl van roadmap.sh, die lokaal draait. Je maakt je eigen
leerpaden door een AI ze te laten schrijven en het antwoord in de app te plakken.
Je voortgang blijft van jou en kan synchroniseren tussen je computer en je telefoon
via je eigen privé repository op GitHub.

## Downloaden

Ga naar de [releases](https://github.com/__REPO__/releases/latest) en pak het bestand
dat bij je apparaat past:

| Bestand | Voor |
|---|---|
| \`Pathfinder-Setup-x.y.z.exe\` | Windows |
| \`Pathfinder-x.y.z.AppImage\` | Linux, elke distributie |
| \`Pathfinder-x.y.z.deb\` | Linux met apt: Debian, Ubuntu, Mint |
| \`Pathfinder-x.y.z.apk\` | Android |

Er is geen account nodig en er wordt niets naar een server gestuurd. Alles blijft op
je eigen apparaat, tenzij je zelf synchronisatie aanzet.

**Windows** waarschuwt bij het installeren dat de maker onbekend is, omdat het bestand
niet is ondertekend met een betaald certificaat. Klik op *Meer informatie* en daarna op
*Toch uitvoeren*.

**Linux**: de AppImage draait zonder installatie. Maak hem uitvoerbaar met
\`chmod +x Pathfinder-*.AppImage\` en start hem; hij werkt zichzelf daarna
bij. De \`.deb\` installeer je met \`sudo apt install ./Pathfinder-*.deb\`.

**Android** vraagt eenmalig toestemming om een app buiten de Play Store te
installeren. De APK is ondertekend met een testsleutel.

Start daarna de app en volg het leerpad **Zo werkt Pathfinder**; daar staat de rest in.

## In de terminal

Er is ook een terminalversie, met dezelfde leerpaden en dezelfde synchronisatie:

\`\`\`bash
npm run tui
\`\`\`

Pijltjes bewegen, \`enter\` opent, \`spatie\` zet de status om, \`?\` toont
alle toetsen. \`npm run tui -- --themas\` laat de themas zien.

## Zelf bouwen of aanpassen

Je hebt [Node.js](https://nodejs.org) 20 of nieuwer nodig.

\`\`\`bash
npm install
npm run dev            # in de browser, tijdens het aanpassen
npm run electron:dev   # als desktop-app
npm run electron:build # maakt het installatiebestand in release/
npm run tui            # de terminalversie, zonder bouwstap
\`\`\`

Linux-pakketten bouw je op Linux, of laat je door de workflow bouwen:

\`\`\`bash
npm run electron:build:linux
\`\`\`

Voor Android voeg je het platform eerst toe:

\`\`\`bash
npx cap add android
npm run android:sync
npm run android:open
\`\`\`

> Werk je op Windows in PowerShell en krijg je de melding dat scripts zijn
> uitgeschakeld, gebruik dan \`npm.cmd\` in plaats van \`npm\`.

## Je eigen versie

Wat je waarschijnlijk wilt aanpassen:

| Waar | Wat |
|---|---|
| \`package.json\` | \`build.appId\`, \`build.productName\`, en de \`publish\`-repository |
| \`capacitor.config.ts\` | \`appId\` en \`appName\` voor Android |
| \`content/roadmaps/\` | je eigen leerpaden als bestanden, zie [content/README.md](content/README.md) |
| \`build/icon.png\` | het app-icoon; \`npm run icons\` tekent het standaardicoon opnieuw |
| \`shared/themes.json\` | de themas van de app en van de terminalversie |

Leerpaden hoef je niet als bestand toe te voegen: alles wat je via **Nieuw leerpad**
importeert, wordt in de app zelf bewaard en gesynchroniseerd.

## Automatisch bijwerken

Push je dit project naar je eigen GitHub-repository, dan bouwen de meegeleverde
workflows bij elke versietag een Windows-installatiebestand, Linux-pakketten en een
APK, en hangen die aan een release. De apps controleren daar zelf op.

\`\`\`bash
npm version patch
git push --follow-tags
\`\`\`

De volledige uitleg over synchronisatie, ondertekening van de APK en het toevoegen
van documenten staat in het originele project.

## Wat er in zit

- een app voor Windows, Linux en Android, plus een terminalversie
- zeven themas, waaronder twee voor wie liever in een terminal zit
- leerpaden als node-graph met pan en zoom, plus een lijstweergave voor mobiel
- vier statussen per onderwerp, notities, bronnen met leesstatus
- overhoorkaarten met spaced repetition
- voortgangsstatistieken en een dag-streak
- documenten uit Word en Excel omzetten naar leesbare markdown in de app
`;

async function writeStarterContent() {
  const roadmapDir = path.join(OUT, 'content', 'roadmaps', 'start');
  await fs.mkdir(path.join(roadmapDir, 'nodes'), { recursive: true });

  await fs.writeFile(
    path.join(roadmapDir, 'roadmap.json'),
    `${JSON.stringify(STARTER_ROADMAP, null, 2)}\n`,
    'utf8'
  );

  for (const [name, body] of Object.entries(STARTER_NODES)) {
    await fs.writeFile(path.join(roadmapDir, 'nodes', name), body, 'utf8');
  }

  // Een lege documentenmap, zodat de app niet over een ontbrekend pad struikelt.
  await fs.mkdir(path.join(OUT, 'content', 'docs'), { recursive: true });
  await fs.writeFile(
    path.join(OUT, 'content', 'docs', '.gitkeep'),
    'Omgezette documenten komen hier terecht; zie npm run content:convert.\n',
    'utf8'
  );
}

const MIT_LICENSE = `MIT License

Copyright (c) ${new Date().getFullYear()} __OWNER__

Hierbij wordt gratis toestemming verleend aan eenieder die een kopie van deze
software en de bijbehorende documentatie verkrijgt, om zonder beperking met de
software te handelen, met inbegrip van het recht om te gebruiken, kopiëren,
wijzigen, samenvoegen, publiceren, distribueren, in sublicentie te geven en te
verkopen, en om anderen aan wie de software wordt verstrekt datzelfde toe te staan,
onder de volgende voorwaarden:

De bovenstaande auteursrechtvermelding en deze toestemmingsverklaring worden
opgenomen in alle kopieën of substantiële delen van de software.

DE SOFTWARE WORDT GELEVERD "ZOALS ZIJ IS", ZONDER ENIGE GARANTIE, UITDRUKKELIJK OF
IMPLICIET, DAARONDER BEGREPEN MAAR NIET BEPERKT TOT GARANTIES VAN VERKOOPBAARHEID,
GESCHIKTHEID VOOR EEN BEPAALD DOEL EN NIET-INBREUKMAKENDHEID. DE AUTEURS OF
RECHTHEBBENDEN ZIJN IN GEEN GEVAL AANSPRAKELIJK VOOR ENIGE CLAIM, SCHADE OF ANDERE
AANSPRAKELIJKHEID, HETZIJ IN EEN CONTRACTUELE ACTIE, ONRECHTMATIGE DAAD OF
ANDERSZINS, VOORTVLOEIEND UIT OF IN VERBAND MET DE SOFTWARE OF HET GEBRUIK ERVAN.
`;

/** Haalt de persoonlijke gegevens uit de gekopieerde bestanden. */
async function depersonalize() {
  const [owner, repoName] = REPO.split('/');

  const packagePath = path.join(OUT, 'package.json');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  // De versie loopt mee met het project, zodat de tag en de app-versie kloppen.
  pkg.author = { name: owner };
  pkg.license = 'MIT';
  pkg.description =
    'Modulaire leerpad-app voor desktop en Android; leerpaden maak je met een AI.';
  pkg.build.appId = 'com.example.pathfinder';
  pkg.build.copyright = '';
  // De publieke repository waar de releases vandaan komen. Geen token nodig, en
  // los van de prive repository waarin iemand zijn eigen voortgang bewaart.
  pkg.build.publish = [
    { provider: 'github', owner, repo: repoName, private: false, releaseType: 'release' },
  ];
  delete pkg.scripts['content:convert'];

  await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  // De standaarden voor de synchronisatie horen neutraal te zijn bij iemand anders.
  const settingsPath = path.join(OUT, 'src', 'store', 'settingsStore.ts');
  const settings = await fs.readFile(settingsPath, 'utf8');
  await fs.writeFile(
    settingsPath,
    settings
      .replace(
        /\/\/ Voorgevuld vanuit de git-instellingen op deze pc; aan te passen in de app\.\n\s*owner: '[^']*',/,
        "owner: '',"
      )
      .replace(
        /\/\/ Jouw eigen prive repo; 'pathfinder' is de publieke versie van de app\.\n\s*repo: '[^']*',/,
        "repo: 'pathfinder-data',"
      ),
    'utf8'
  );

  await fs.writeFile(
    path.join(OUT, 'LICENSE'),
    MIT_LICENSE.replace('__OWNER__', owner),
    'utf8'
  );

  const capacitorPath = path.join(OUT, 'capacitor.config.ts');
  const capacitor = await fs.readFile(capacitorPath, 'utf8');
  await fs.writeFile(
    capacitorPath,
    capacitor.replace("appId: 'nl.araldo.pathfinder'", "appId: 'com.example.pathfinder'"),
    'utf8'
  );

  await fs.writeFile(path.join(OUT, 'README.md'), SKELETON_README.replaceAll('__REPO__', REPO), 'utf8');

}

/**
 * Leegt de doelmap, maar laat .git en node_modules staan. Zo blijft de
 * geschiedenis van de publieke repository behouden als je het skelet opnieuw
 * genereert, en hoeven de pakketten niet opnieuw geinstalleerd te worden.
 */
const KEEP = new Set(['.git', 'node_modules']);

async function clearTarget() {
  let entries;
  try {
    entries = await fs.readdir(OUT, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (KEEP.has(entry.name)) continue;
    await fs.rm(path.join(OUT, entry.name), { recursive: true, force: true });
  }
}

async function main() {
  await clearTarget();
  await copyTree(ROOT, OUT);
  await writeStarterContent();
  await depersonalize();

  // Het manifest hoort bij de nieuwe inhoud, niet bij de oude.
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [path.join(OUT, 'scripts', 'build-content-index.mjs')], {
    cwd: OUT,
    stdio: 'inherit',
  });

  console.log(`\nSkelet klaar in ${OUT}`);
  console.log('Controleer het met: npm install && npm run dev');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
