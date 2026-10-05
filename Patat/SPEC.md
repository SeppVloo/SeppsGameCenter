# Patat – Specificatie

> Houd dit document bij bij elke nieuwe of gewijzigde spec (incl. changelog), in dezelfde commit als de code.

## Overzicht
- Gezinsapp om snacks bij de patat te bestellen. Iedereen bestelt op zijn **eigen apparaat**; de **snackbakker** ziet een overzicht en beheert de voorraad.
- Route `/patat` (bestellen), `/patat/bakker` (bak-overzicht), `/patat/voorraad` (voorraadbeheer). Tegel in de GameCenter.
- Nederlandstalig, werkt op laptop, iPad en iPhone. Gehost op GitHub Pages samen met de rest van de site (geen eigen server).

## Architectuur (zelfde aanpak als 2048)
- **Razor Class Library** `Patat`, gehost door `PongWeb` (`App.razor` → `ExtraGames`, `index.html` laadt `_content/Patat/patat.css`).
- `Model/PatatEngine.cs`: pure logica, geen UI. `PatatState` = snacks, bestellingen, mandjes (batches), `Open`, `Rejected`.
- `Pages/PatatPage.razor`: instellen, bestellen, tabs, JS-interop en synchronisatie.
- `Components/BakkerView.razor`, `Components/VoorraadView.razor`, `Components/Help.razor` (❓ Hoe werkt het?).
- `wwwroot/patat.js`: Trystero (MQTT-strategie, net als Pong) + localStorage.
- `wwwroot/patat.css`: alle stijlen met prefix `pt-`.

## Synchronisatie
- Iedereen met dezelfde **gezinscode** komt in Trystero-room `fam-<code>` (appId `sepp-patat-v1`). Werkt via wifi én mobiel internet.
- Het apparaat van de **snackbakker** is de bron van waarheid: bewaart de state in localStorage (`patat.state`) en stuurt na elke wijziging de hele state (JSON) naar iedereen. Nieuwe peers krijgen direct de state.
- Andere apparaten sturen alleen `order` (JSON `Order`) of `cancel` (naam). Een verzonden bestelling blijft *pending* (`patat.pending`) en wordt opnieuw verstuurd bij elke ontvangen state, tot de state die bestelling (zelfde `Stamp`) bevat of in `Rejected` staat.
- Er hoort precies één snackbakker te zijn. Zonder online snackbakker kan niemand bestellen ("Wachten op de snackbakker…").

## Regels
- Eén bestelling per persoon (naam, hoofdletterongevoelig); opnieuw bestellen vervangt de vorige.
- Voorraad wordt bij bestellen meteen gereserveerd (afgetrokken) en bij annuleren teruggegeven. Meer bestellen dan voorraad kan niet (UI begrenst, engine weigert).
- Bestellen kan alleen als `Open` aan staat (schakelaar op het bak-scherm).
- **Nieuwe ronde** wist bestellingen, mandjes en weigeringen; voorraad blijft zoals hij is.

## Samen bakken
- Elke snack heeft een baktijd (minuten) en een **frituurgroep**. Snacks met dezelfde groep (hoofdletterongevoelig) gaan samen in één mandje; lege groep = altijd los.
- Mandje-tijd = langste baktijd in de groep. Mandjes staan op volgorde van langste eerst.
- Per mandje: *Start* (timer, knippert als hij klaar is), *Klaar*, *Opnieuw*. Komt er een bestelling bij voor een mandje dat al klaar was, dan gaat dat mandje terug naar open.

## Opslag (localStorage)
- `patat.name`, `patat.code`, `patat.bakker` ("1"), `patat.state` (alleen bakker), `patat.pending` (alleen niet-bakker).

## Changelog
- **Basis:** bestellen per apparaat, bakker-overzicht met mandjes per frituurgroep en timers, voorraadbeheer, synchronisatie via Trystero, in-app hulp.
