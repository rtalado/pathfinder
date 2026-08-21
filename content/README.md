# Content

Alles in deze map is **gegevens**, geen code. De app leest het bij het opstarten en
haalt wijzigingen op bij de sync, zodat een nieuw leerpad geen nieuwe app-versie vraagt.

```
content/
├── manifest.json          inhoudsopgave met een hash per bestand (gegenereerd)
├── roadmaps/<id>/
│   ├── roadmap.json       de structuur van het leerpad
│   └── nodes/*.md         de uitleg per onderwerp
└── docs/<collectie>/
    ├── index.json         overzicht van de documenten (gegenereerd)
    └── *.md               omgezette Word- en Excel-bestanden
```

Na elke wijziging:

```bash
npm run content:check     # controleert verwijzingen, ouders, dubbele ids
npm run content:index     # werkt manifest.json bij
```

## roadmap.json

### Het leerpad zelf

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | moet gelijk zijn aan de mapnaam |
| `title` | ja | naam in de zijbalk en op het dashboard |
| `subtitle` | nee | één regel onder de titel |
| `description` | nee | alinea bovenaan de lijstweergave |
| `icon` | nee | naam uit `src/components/Icon.tsx` |
| `color` | nee | accentkleur als hex |
| `version` | ja | verhoog bij een inhoudelijke herziening |
| `order` | nee | volgorde op het dashboard (lager komt eerst) |
| `estimatedHours` | nee | indicatie van de studielast |
| `nodes` | ja | de onderwerpen |

### Een node

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | uniek binnen dit leerpad; wordt gebruikt als sleutel voor je voortgang |
| `title` | ja | tekst in het blokje |
| `kind` | ja | `milestone`, `topic`, `subtopic` of `label` |
| `parent` | voor alles behalve milestone | id van de node waar dit aan hangt |
| `side` | nee | `left` of `right`; zonder waarde kiest de layout zelf |
| `group` | nee | onderwerpen met dezelfde groep en ouder komen naast elkaar op één rij |
| `optional` | nee | toont "(optioneel)" en telt lichter mee |
| `summary` | aanbevolen | één tot drie zinnen; verschijnt als tooltip en in het paneel |
| `body` | nee | pad naar markdown, bijvoorbeeld `nodes/mijn-onderwerp.md` |
| `resources` | nee | bronnen met eigen leesstatus |
| `flashcards` | nee | vraag-antwoordkaarten |
| `docs` | nee | verwijzingen naar omgezette documenten |
| `tags` | nee | labels in het zijpaneel |

> **Let op:** verander een bestaande `id` niet. De voortgang wordt eraan opgehangen;
> hernoemen betekent dat een afgevinkt onderwerp weer op nul staat.

### De vier soorten nodes

- **`milestone`** — hoofdstap op de verticale ruggengraat. Geel, groot.
- **`topic`** — onderwerp dat aan een milestone hangt. Paars, links of rechts.
- **`subtopic`** — detail onder een topic, aan de buitenkant.
- **`label`** — uitlegkader zonder voortgang. De `summary` is de tekst die je in
  de kaart ziet; handig voor een begrip dat verwarring geeft.

### Bronnen

```json
{
  "title": "RFC 6749: The OAuth 2.0 Authorization Framework",
  "url": "https://datatracker.ietf.org/doc/html/rfc6749",
  "type": "standard",
  "note": "Waarom dit de moeite waard is.",
  "free": true,
  "minutes": 45
}
```

Of, in plaats van een vast adres, een **zoekopdracht** waar de app zelf een
werkende zoeklink van maakt:

```json
{ "title": "Uitleg in video", "query": "oauth 2 authorization code flow explained", "searchOn": "youtube" }
```

Dat bestaat omdat een AI links naar specifieke videos en artikelen met overtuiging
verzint. Een zoekopdracht kan niet dood zijn en levert bovendien het actuele
materiaal op. `searchOn` is `youtube` of `web`.

`type` is een van: `article`, `video`, `book`, `course`, `standard`, `tool`,
`podcast`, `practice`. Een bron met een `query` wordt automatisch `search`.

### Flashcards

```json
{
  "id": "c1",
  "question": "Korte, scherpe vraag?",
  "answer": "Antwoord in **markdown**, gerust een paar alinea's.",
  "hint": "Optionele hint."
}
```

De `id` hoeft alleen uniek te zijn binnen de node. Herhalingen worden per kaart
bijgehouden met een vereenvoudigde SM-2: *niet geweten* komt binnen tien minuten
terug, *twijfel* en *wist ik* schuiven het interval op.

### Documentverwijzingen

```json
{ "collection": "iso27001", "id": "03-beleid-d13-toegangsbeveiligingsbeleid-v1-0" }
```

De `id` is de bestandsnaam zonder `.md` uit `docs/<collectie>/`. Alle beschikbare
ids staan in `docs/<collectie>/index.json`. `npm run content:check` waarschuwt als
een verwijzing niet klopt.

## De plattegrond

Je geeft geen posities op; die worden uitgerekend in `src/lib/layout.ts`:

- fasen staan onder elkaar op een ruggengraat die licht slingert
- de onderwerpen van een fase vormen clusters links en rechts ervan
- details staan ingesprongen onder hun onderwerp, met een gestippelde haak ernaartoe
- blokken zijn zo breed als hun tekst, met een maximum per soort
- onderwerpen met dezelfde `group` komen naast elkaar op een rij
- elke fase krijgt een eigen tint, afgeleid van de kleur van het leerpad

Wil je meer sturing, gebruik dan `side` op een onderwerp. Meer dan dat is zelden
nodig; als een leerpad scheef oogt, is het vaak een teken dat een fase te veel
onderwerpen heeft.

## Markdown

Gewone GitHub-flavored markdown: koppen, lijsten, tabellen, code, citaten. Externe
links openen in de systeembrowser.

Praktische richtlijnen:

- begin met een `#` kop die de titel van de node herhaalt
- houd alinea's kort; dit wordt op een telefoon gelezen
- gebruik tabellen voor vergelijkingen, niet voor opsommingen
- zet de praktijk erin: waar gaat dit in het echt mis?

## Documenten omzetten

```bash
npm run content:convert -- --source "C:\pad\naar\map" --target docs/mijn-verzameling
```

- `.docx` → markdown via mammoth en turndown, inclusief tabellen; Word-inhoudsopgaven
  worden verwijderd omdat de app zelf navigeert
- `.xlsx` → een markdown-tabel per werkblad
- `.md` → overgenomen
- afbeeldingen en `.svg` → gekopieerd naar `_assets/`

Elk bestand krijgt front matter met de titel, documentcode, versie, map en het pad
naar het origineel. Dat laatste maakt de knop *Origineel* in de Windows-app mogelijk.
