# Pathfinder

Een leerpad-app in de stijl van roadmap.sh, die lokaal draait. Je maakt je eigen
leerpaden door een AI ze te laten schrijven en het antwoord in de app te plakken.
Je voortgang blijft van jou en kan synchroniseren tussen je computer en je telefoon
via je eigen privé repository op GitHub.

## Downloaden

Ga naar de [releases](https://github.com/rtalado/pathfinder/releases/latest) en pak het bestand
dat bij je apparaat past:

| Bestand | Voor |
|---|---|
| `Pathfinder-Setup-x.y.z.exe` | Windows |
| `Pathfinder-x.y.z.AppImage` | Linux, elke distributie |
| `Pathfinder-x.y.z.deb` | Linux met apt: Debian, Ubuntu, Mint |
| `Pathfinder-x.y.z.apk` | Android |

Er is geen account nodig en er wordt niets naar een server gestuurd. Alles blijft op
je eigen apparaat, tenzij je zelf synchronisatie aanzet.

**Windows** waarschuwt bij het installeren dat de maker onbekend is, omdat het bestand
niet is ondertekend met een betaald certificaat. Klik op *Meer informatie* en daarna op
*Toch uitvoeren*.

**Linux**: de AppImage draait zonder installatie. Maak hem uitvoerbaar met
`chmod +x Pathfinder-*.AppImage` en start hem; hij werkt zichzelf daarna bij. De
`.deb` installeer je met `sudo apt install ./Pathfinder-*.deb` en werk je bij door
een nieuwe te installeren. Je tokens worden bewaard in de sleutelbos van je
bureaublad; draait die niet, dan komen ze in een bestand dat alleen jij mag lezen.

**Android** vraagt eenmalig toestemming om een app buiten de Play Store te
installeren. De APK is ondertekend met een testsleutel.

Start daarna de app en volg het leerpad **Zo werkt Pathfinder**; daar staat de rest in.

## In de terminal

Naast de vensterversie is er een terminalversie met dezelfde leerpaden, dezelfde
voortgang en dezelfde synchronisatie. Handig op een server, via ssh, of gewoon omdat
het sneller werkt dan klikken.

```bash
npm run tui
```

| Toets | Doet |
|---|---|
| pijltjes of `j`/`k` | bewegen |
| `enter` | openen |
| `spatie` | status omzetten: te doen, mee bezig, afgerond, overgeslagen |
| `n` | notitie bij een onderwerp |
| `o` | overhoren |
| `d` | documenten |
| `i` | instellingen |
| `s` | nu synchroniseren |
| `t` | volgend thema |
| `?` | alle toetsen |
| `q` | stoppen |

Er zijn geen extra pakketten voor nodig, alleen Node. Je voortgang komt in je eigen
configuratiemap te staan (`~/.config/pathfinder` op Linux, `%APPDATA%Pathfinder` op
Windows); `npm run tui -- --waar` laat zien waar precies. Vul bij **instellingen**
dezelfde repository of server in als in de app, dan lopen ze gelijk.

Je token komt in `secrets.json` in die map, leesbaar maar alleen voor jouw account.
De vensterversie kan het op Windows en Linux wél versleutelen, omdat die bij de
sleutelbos van je bureaublad kan; een terminalprogramma kan dat niet zonder daar een
half bureaublad bij te halen.

`npm run tui -- --themas` toont de thema's, `--thema nord` start er meteen mee. Kan
je terminal geen UTF-8 aan, zet dan `PATHFINDER_ASCII=1`; dan gebruikt hij gewone
tekens.

## Zelf bouwen of aanpassen

Je hebt [Node.js](https://nodejs.org) 20 of nieuwer nodig.

```bash
npm install
npm run dev            # in de browser, tijdens het aanpassen
npm run electron:dev   # als desktop-app
npm run electron:build # maakt het installatiebestand in release/
```

Voor de terminalversie is geen bouwstap nodig:

```bash
npm run tui
```

Linux-pakketten bouw je op Linux (of laat je door de workflow bouwen), omdat
electron-builder daar de gereedschappen voor AppImage en dpkg nodig heeft:

```bash
npm run electron:build:linux
```

Voor Android voeg je het platform eerst toe:

```bash
npx cap add android
npm run android:sync
npm run android:open
```

> Werk je op Windows in PowerShell en krijg je de melding dat scripts zijn
> uitgeschakeld, gebruik dan `npm.cmd` in plaats van `npm`.

## Je eigen versie

Wat je waarschijnlijk wilt aanpassen:

| Waar | Wat |
|---|---|
| `package.json` | `build.appId`, `build.productName`, en de `publish`-repository |
| `capacitor.config.ts` | `appId` en `appName` voor Android |
| `content/roadmaps/` | je eigen leerpaden als bestanden, zie [content/README.md](content/README.md) |
| `build/icon.png` | het app-icoon; `npm run icons` tekent het standaardicoon opnieuw |

Leerpaden hoef je niet als bestand toe te voegen: alles wat je via **Nieuw leerpad**
importeert, wordt in de app zelf bewaard en gesynchroniseerd.

## Automatisch bijwerken

Push je dit project naar je eigen GitHub-repository, dan bouwen de meegeleverde
workflows bij elke versietag een Windows-installatiebestand, een AppImage, een .deb
en een APK, en hangen die aan een release. De apps controleren daar zelf op.

```bash
npm version patch
git push --follow-tags
```

De volledige uitleg over synchronisatie, ondertekening van de APK en het toevoegen
van documenten staat in het originele project.

## Wat er in zit

- een grafische app voor Windows, Linux en Android, en een terminalversie
  (`npm run tui`) met dezelfde leerpaden en dezelfde synchronisatie
- zeven thema's, waaronder twee terminalthema's; zie [shared/themes.json](shared/themes.json)
- leerpaden als node-graph met pan en zoom, plus een lijstweergave voor mobiel
- vier statussen per onderwerp, notities, bronnen met leesstatus
- overhoorkaarten met spaced repetition
- voortgangsstatistieken en een dag-streak
- documenten uit Word en Excel omzetten naar leesbare markdown in de app
