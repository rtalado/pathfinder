# LearnPath-server

Een klein programma dat je voortgang en je eigen leerpaden bewaart, zodat je
apparaten gelijk lopen zonder dat je gegevens het huis uit gaan. Draait prima op een
Raspberry Pi, een NAS of een oude laptop.

Eén bestand, geen afhankelijkheden, alleen Node.js 18 of nieuwer.

## Starten

```bash
node learnpath-server.mjs
```

Bij de eerste start maakt hij een toegangssleutel aan, toont die in het venster en
bewaart hem in `data/token.txt`. Die sleutel vul je in de app in.

```
LearnPath-server 1.0.0
Luistert op poort 8787, gegevens in /home/pi/learnpath/data
```

## Instellen in de app

Ga in LearnPath naar **Instellingen → Synchronisatie**, kies **Eigen server** en vul in:

| Veld | Waarde |
|---|---|
| Adres van je server | `http://raspberrypi.local:8787` |
| Toegangssleutel | de sleutel uit `data/token.txt` |

Klik op *Verbinding testen* en zet de schakelaar aan. Doe hetzelfde op je andere
apparaat, met dezelfde sleutel.

Werkt `raspberrypi.local` niet, gebruik dan het IP-adres. Dat vind je met:

```bash
hostname -I
```

## Blijvend laten draaien

Op een Pi met systemd, als `/etc/systemd/system/learnpath.service`:

```ini
[Unit]
Description=LearnPath sync-server
After=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/learnpath
ExecStart=/usr/bin/node /home/pi/learnpath/learnpath-server.mjs
Environment=PORT=8787
Environment=DATA_DIR=/home/pi/learnpath/data
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Daarna:

```bash
sudo systemctl enable --now learnpath
sudo systemctl status learnpath
journalctl -u learnpath -f
```

## Instellingen

| Variabele | Standaard | Betekenis |
|---|---|---|
| `PORT` | `8787` | poort om op te luisteren |
| `DATA_DIR` | `./data` | waar de gegevens komen te staan |
| `TOKEN` | uit `data/token.txt` | de toegangssleutel |

## Wat er op schijf staat

```
data/
├── token.txt          de toegangssleutel
├── progress.json      je voortgang, notities en overhoorkaarten
├── progress.json.bak  de vorige versie
└── roadmaps.json      de leerpaden die je zelf hebt toegevoegd
```

Het zijn gewone JSON-bestanden. Een back-up is dus een kopie van deze map. Voor de
zekerheid houdt de server bij elke schrijfactie de vorige versie apart in `.bak`.

## Hoe het samenvoegen werkt

Elk document wordt opgehaald met een versie erbij. De app voegt samen met wat er
lokaal staat en schrijft terug met die versie. Is er intussen een ander apparaat
geweest, dan weigert de server met een 409 en haalt de app het opnieuw op. Per
onderwerp wint de meest recente wijziging, dus er gaat niets verloren.

## Over de beveiliging

- Alles gaat via één sleutel; zonder die sleutel antwoordt de server op niets, ook
  niet op de gezondheidscontrole.
- De verbinding is **niet versleuteld**. Op je eigen thuisnetwerk is dat gebruikelijk
  en te overzien. Wil je hem van buitenaf bereiken, zet er dan geen poort voor open,
  maar gebruik iets als [Tailscale](https://tailscale.com/) of WireGuard, of zet er
  een reverse proxy met een certificaat voor.
- De sleutel is willekeurig en 24 bytes lang. Wil je hem vervangen: verwijder
  `data/token.txt`, herstart, en vul de nieuwe sleutel op je apparaten in.
- Android staat verbindingen zonder https standaard niet toe. De app zet dat aan,
  juist voor deze situatie.

## De API

Voor wie zelf iets wil bouwen. Alles vraagt `Authorization: Bearer <sleutel>`.

| Verzoek | Antwoord |
|---|---|
| `GET /api/v1/health` | `{ "name": "learnpath-server", "version": "1.0.0", "documents": 2 }` |
| `GET /api/v1/doc/progress` | `{ "data": "...", "version": "abc123" }` of 404 |
| `PUT /api/v1/doc/progress` | verstuur `{ "version": "abc123", "data": "..." }`, krijgt `{ "version": "def456" }` of 409 |

Er zijn twee documenten: `progress` en `roadmaps`. Bij de allereerste schrijfactie
stuur je `"version": null`.
