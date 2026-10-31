# Race – Specificatie

> Houd dit document bij bij elke nieuwe of gewijzigde spec (incl. changelog), in dezelfde commit als de code.

## Overzicht
- Racegame op een snelweg met 4 banen en bochten: ontwijk verkeer, pak munten, rijd zo ver mogelijk of race naar de finish. Nederlandstalig, speelbaar op laptop, iPad en iPhone.
- Route `/race`, tegel 🏎️ in de GameCenter (`PongWeb/Pages/GameCenter.razor`).
- Twee camera's: **🗺️ bovenaanzicht** en **🎥 cockpit** (pseudo-3D, in de auto met dashboard en stuur). Wisselen met de knop of toets V; keuze bewaard in `race.view`.
- Drie modi: **🚗 Solo** (eindeloos), **👥 Samen** (2 spelers, split-screen op één apparaat) en **🌐 Online** (tot 4 spelers via kamercode).

## Architectuur (zelfde aanpak als 2048 en Ultimate)
- **Razor Class Library** `Race`, gehost door de Blazor WebAssembly-app `PongWeb` (één site, één deploy).
  - `PongWeb/App.razor` registreert de assembly via `AdditionalAssemblies` (`ExtraGames`).
  - `PongWeb/wwwroot/index.html` laadt `_content/Race/race.css`.
- `Game/Track.cs`: deterministische baan op basis van een **seed** (bochten + verkeer + munten). Zelfde seed = zelfde baan, zodat multiplayer eerlijk is.
- `Game/RaceEngine.cs`: pure spellogica per speler: `Start(seed, finishZ, lane)`, `Tick(dt, steer, throttle)`, aftellen, bochtkracht, botsingen, munten, levens, finish. `Frame()` levert een `RaceFrame` (posities relatief aan de speler + kromming vooruit) om te tekenen. Geen UI-code.
- `Pages/RacePage.razor`: modus-keuze, online-paneel, overlays, uitslag + JS-interop. `Tick(dt, input[])` is `[JSInvokable]` en wordt elke animatieframe synchroon aangeroepen voor alle lokale spelers.
- `wwwroot/race.js`: input (toetsen, pointer per canvas), de `requestAnimationFrame`-lus en het tekenen (bovenaanzicht en cockpit) op canvas; localStorage.
- `wwwroot/race-net.js`: online via publieke MQTT-brokers (EMQX + HiveMQ tegelijk, topic `sepp-race-v1/<CODE>`), zonder WebRTC zodat het ook achter strenge routers werkt; wordt pas geladen bij *Verbinden*.
- `wwwroot/race.css`: alle stijlen met prefix `race-`.

## Regels
- Weg van x=0 tot 1 (4 banen van 0,25); z = afstand langs de baan (1 eenheid = 20 m).
- Basissnelheid start op 1,0 en stijgt met 0,02/s tot max 2,6. Gas = +50%, remmen = −50%. Naast de weg (gras): snelheid ×0,45.
- **Bochten:** segmenten van 6–16 eenheden, recht of kromming 0,15–0,4 (zacht in/uit). In een bocht word je naar buiten geduwd: `kromming × snelheid² × 0,3` per seconde; tegensturen nodig.
- Verkeer rijdt dezelfde kant op met een vaste snelheid per baan (0,45/0,55/0,65/0,75); per rij 1 of 2 auto's, rijen komen steeds dichter op elkaar. ~35% van de rijen heeft een munt in een vrije baan, anders 12% kans op een power-up.
- **Baanwissels:** ~45% van de auto's wisselt naar een buurbaan (links of rechts, wat vrij is) zodra je ze over ~2 s inhaalt: eerst 1,3 s knipperlicht, dan in 0,9 s opschuiven. Alleen als de doelbaan vrij is. Deterministisch op auto-id (gelijk voor iedereen met dezelfde seed).
- **Power-ups** (16% kans per rij zonder munt, 7 soorten): 👻 spook (5 s door andere auto's heen rijden), ⚡ turbo (4 s snelheid x1,5), ❤️ extra leven (max 5), 🧲 magneet (8 s munten binnen 0,45 zijwaarts / 0,6 vooruit), 🛡️ schild (volgende botsing kost geen leven), ✖️2 dubbele munten (10 s), 🐜 mini (7 s kleinere auto en botsvlak).
- Auto's zijn 0,16 breed; botsing als de afstand zijwaarts < 0,147 is (en < 0,176 in rijrichting). Op de lijn tussen twee auto's in naastgelegen banen door rijden kan dus niet.
- Levens instelbaar (standaard 3). Botsing: −1 leven, snelheid ×0,4, 2 seconden onkwetsbaar (knipperen). 0 levens: *Game over* / uit de race.
- Score = meters + 50 per munt. Solo: beste score in localStorage `race.best`.
- Start na 3 seconden aftellen.

## Instellingen
- Paneel *Instellingen* (`RaceSettings`, opgeslagen in `race.settings`): beginsnelheid, topsnelheid, sneller worden, verkeer (0,2-2; standaard 0,75: rijafstand / verkeer, kans op 2 auto's 25% x verkeer^2), baanwissels (0-90%, standaard 35), bochten (0-2), munten, power-ups, levens (1-9), racelengte (1-10 km), spelers botsen. Snelkeuze Makkelijk/Normaal/Moeilijk. Online gelden de instellingen van wie op start drukt (meegestuurd in het startbericht).

## Weergave
- Bovenaanzicht: weg buigt mee met de bochten; auto's draaien mee met de richting van de weg; wielen steken uit de carrosserie en de voorwielen van je eigen auto draaien zichtbaar mee met sturen. Knipperlichten bij baanwissels.
- Cockpit: camera zit 0,9 achter en hoger (0,32) met horizon op 45% en breder beeld, zodat de hele weg en de bermen zichtbaar zijn (meer zijkant zichtbaar); wegsegmenten 3x fijner (0,1) voor een 3x vloeiender beeld; segmenten liggen vast in de wereld, verre segmenten kleiner dan een pixel worden overgeslagen. Auto's voor je draaien mee in de bocht en tonen dan hun zijkant. Dashboard met snelheid/levens en een stuur dat meedraait.

## Multiplayer
- **Samen (split-screen):** 2 spelers, twee canvassen naast elkaar, dezelfde seed, startbanen 2 en 3. Racelengte instelbaar (standaard 3 km).
- **Online:** kamercode (4 letters, *Nieuwe code* of zelf invullen) + naam (`race.name`). Iedereen in de kamer kan *Start race voor iedereen* drukken: die stuurt de seed, ieder start tegelijk met eigen startbaan (op volgorde van peer-id). Race van 3 km.
- Elke speler stuurt ~10x/s zijn positie; andere spelers worden met naam getekend. **Spelersbotsing** (instelbaar, standaard aan, ook bij Samen): je wordt opzij geduwd (achterste remt x0,85) en knippert kort, maar het kost **geen leven**; met spook rijd je erdoorheen. **Power-ups zijn exclusief:** wie er het eerst een pakt stuurt een `pick`-bericht (2x) en bij de rest verdwijnt hij. Elke 2 s een groet; wie 6 s niets stuurt verdwijnt uit de lijst.
- Uitslag zodra alle lokale spelers klaar zijn: eerst gefinisht (op tijd), dan nog rijdend, dan uitgevallen (op afstand). Online werkt de uitslag live bij.

## Besturing
- Solo/online: ←/→ of A/D sturen, ↑/W gas, ↓/S remmen. Samen: speler 1 A/D/W/S, speler 2 pijltjes. V = camera wisselen.
- Touch/muis: vinger op de weg houden/slepen; de auto stuurt naar de vinger. Hoogte van de vinger bepaalt gas/rem: bovenste 40% = gas, onderste 25% = remmen, daartussen gewoon rijden (zones zichtbaar met een groene en rode lijn, de actieve zone licht op). Samen: ieder op zijn eigen helft.
- Hint toont alleen wat bij het apparaat past (coarse pointer = touch).
- Inklapbare **❓ Hoe speel je?** boven de weg. Houd deze tekst bij als regels veranderen.

## Richtlijnen bij aanpassen
- Spellogica alleen in de engine/track; de pagina rendert overlays en JS levert input, tekenwerk en netwerk.
- UI-teksten in het Nederlands, mobiel-vriendelijk.
- Na wijzigingen: build, dit document + changelog bijwerken, commit en push.

## Changelog
- **Basis:** racegame met 4 banen, verkeer, munten, 3 levens, toenemende snelheid, beste score, toetsenbord- en touchbesturing.
- **Help:** inklapbare uitleg "Hoe speel je?".
- **Cockpit, bochten en multiplayer:** pseudo-3D cockpitcamera naast het bovenaanzicht; bochten met buitenwaartse kracht en gras naast de weg; deterministische baan via seed; split-screen voor 2 spelers en online tot 4 spelers met kamercode (spookauto's, race van 3 km, uitslag); aftellen bij de start.
- **Soepeler en echter:** cockpit vloeiender (wereld-vaste segmenten, minder tekenwerk); auto's draaien mee in bochten; voorwielen draaien mee met sturen; auto's breder + strengere botsing zodat je niet meer tussen twee auto's door over de lijn kunt.

- Fix: syntaxfout in race.js (afgebroken constantenregel) waardoor het spel niet meer startte; online spelers groeten elkaar nu elke 2 s opnieuw en verschijnen direct bij binnenkomst, zodat ze elkaar altijd vinden.
- **Power-ups en knipperende auto's:** power-ups spook/turbo/extra leven; verkeer wisselt soms van baan na knipperen; online via MQTT-berichten i.p.v. WebRTC (spelers vonden elkaar niet); duidelijk draaiende voorwielen in bovenaanzicht; cockpit 3x fijnere segmenten en camera verder naar achteren.
- **Fix zichtbaarheid en online:** baanwissels gebeuren nu vlak voor je (zichtbaar), probeert beide richtingen; cockpitcamera verder naar achteren/hoger; online spookauto's vloeiend (volgnummers tegen dubbele/oude berichten, voorspelling met snelheid en zachte correctie).
- **Meer power-ups:** magneet, schild, dubbele munten en mini erbij; power-ups vaker (16%).
- **Gas en remmen op touch (iOS):** vinger hoog = gas, laag = remmen, met zichtbare zones.
- **Instellingen, spelersbotsing en eerlijke power-ups:** alles instelbaar (snelheid, verkeer, baanwissels, bochten, munten, power-ups, levens, racelengte, botsen) met presets; standaard minder verkeer (75%, minder dubbele rijen, 35% baanwissels i.p.v. 45%); spelers duwen elkaar opzij zonder leven te verliezen; een power-up is voor wie hem het eerst pakt.
- **Schuifknoppen gerepareerd:** instellingen-schuifjes gebruiken een vaste notatie (punt als decimaalteken), zodat ze met Nederlandse taalinstelling niet meer naar het maximum of verder schieten.
- **Motorkap in cockpit:** in cockpitmodus zie je de voorkant van je eigen auto (in je spelerkleur, met koplampen) op de echte plek en breedte, zodat je kunt inschatten of je ergens langs past.
- **Cockpit als echte auto:** je zit verder naar voren (camera 0,6 achter i.p.v. 0,9) met een korte motorkap; voorruit met dak en schuine stijlen; achteruitkijkspiegel (gespiegeld, tot 4 eenheden achter je) met verkeer dat je inhaalt en spelers die achterop komen. Verkeer blijft daarvoor tot 4 eenheden achter je bestaan.
- **Breder op laptops en kortere neus:** op schermen met muis (>= 700 px) is het speelveld 16:10 (samen 2:1) en de pagina tot 1100 px breed; canvasbreedte volgt de getoonde verhouding. Bovenaanzicht houdt dezelfde wegbreedte (gecentreerd, gras ernaast), cockpit schaalt op hoogte en laat meer zijkant zien. Motorkap nog korter (tot 0,02 voor je i.p.v. 0,12 achter).
- **Laptop-hoogte:** breed speelveld is maximaal 60% van de schermhoogte, zodat het past (was hoger dan het oude staande veld).
- **Kleiner speelveld op laptops:** breed veld max 760 px breed en 52% schermhoogte (samen max 1000 px), pagina max 820 px.
- **Past in hoogte:** help en instellingen staan onder het speelveld; op laptops compactere kop en minder ruimte, zodat het veld volledig in beeld past.
- **Cockpit lager en HUD zichtbaar:** camera lager (hoogte 0,17 i.p.v. 0,3); levens en snelheid staan ook in cockpit linksboven (waren onzichtbaar op het dashboard). Speelveld op laptops max 40% schermhoogte zodat het op 100% zoom past.
