# LearnPath

Een leerpad-app in de stijl van roadmap.sh, die lokaal draait. Je maakt je eigen
leerpaden door een AI ze te laten schrijven en het antwoord in de app te plakken.
Je voortgang blijft van jou en kan synchroniseren tussen je computer en je telefoon
via je eigen privé repository op GitHub.

## Downloaden

Ga naar de [releases](https://github.com/rtalado/learnpath/releases/latest) en pak het bestand
dat bij je apparaat past:

| Bestand | Voor |
|---|---|
| `LearnPath-Setup-x.y.z.exe` | Windows |
| `LearnPath-x.y.z.apk` | Android |

Er is geen account nodig en er wordt niets naar een server gestuurd. Alles blijft op
je eigen apparaat, tenzij je zelf synchronisatie aanzet.

**Windows** waarschuwt bij het installeren dat de maker onbekend is, omdat het bestand
niet is ondertekend met een betaald certificaat. Klik op *Meer informatie* en daarna op
*Toch uitvoeren*.

**Android** vraagt eenmalig toestemming om een app buiten de Play Store te
installeren. De APK is ondertekend met een testsleutel.

Start daarna de app en volg het leerpad **Zo werkt LearnPath**; daar staat de rest in.

## Zelf bouwen of aanpassen

Je hebt [Node.js](https://nodejs.org) 20 of nieuwer nodig.

```bash
npm install
npm run dev            # in de browser, tijdens het aanpassen
npm run electron:dev   # als desktop-app
npm run electron:build # maakt het installatiebestand in release/
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
workflows bij elke versietag een Windows-installatiebestand en een APK, en hangen die
aan een release. De apps controleren daar zelf op.

```bash
npm version patch
git push --follow-tags
```

De volledige uitleg over synchronisatie, ondertekening van de APK en het toevoegen
van documenten staat in het originele project.

## Wat er in zit

- leerpaden als node-graph met pan en zoom, plus een lijstweergave voor mobiel
- vier statussen per onderwerp, notities, bronnen met leesstatus
- overhoorkaarten met spaced repetition
- voortgangsstatistieken en een dag-streak
- documenten uit Word en Excel omzetten naar leesbare markdown in de app
