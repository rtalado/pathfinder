# 3. Op meerdere apparaten

De app kan je voortgang en je eigen leerpaden gelijk houden tussen je computer en je telefoon. Je kiest zelf waar die gegevens heen gaan: naar een eigen privé repository op GitHub, of naar een klein programma dat je zelf draait op bijvoorbeeld een Raspberry Pi. In beide gevallen komt er geen dienst van iemand anders aan te pas.

## Via GitHub

1. Een GitHub-account.
2. Een **privé** repository, bijvoorbeeld met de naam learnpath-data.
3. Een fine-grained token met toegang tot alleen die ene repository, met de rechten Contents: read and write.

Die drie vul je in bij **Instellingen**. Klik op Verbinding testen en zet de schakelaar aan. Doe hetzelfde op je andere apparaat.

## Via je eigen server

In de map server van dit project staat een programma van één bestand. Start het op de machine die aan blijft staan:

    node learnpath-server.mjs

Hij toont een toegangssleutel. Vul in de app het adres van die machine in, plus de sleutel. Je gegevens verlaten je huis dan niet.

## Hoe het samenvoegt

Vink je op je telefoon iets af terwijl je pc uit staat, dan komt dat er vanzelf bij zodra die weer synchroniseert. Per onderwerp wint de meest recente wijziging; er gaat niets verloren.

Zonder synchronisatie werkt alles gewoon, alleen dan per apparaat.
