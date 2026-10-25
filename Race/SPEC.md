# Race – Specificatie

> Houd dit document bij bij elke nieuwe of gewijzigde spec (incl. changelog), in dezelfde commit als de code.

## Overzicht
- Top-down racegame op een snelweg met 4 banen: ontwijk verkeer, pak munten, rijd zo ver mogelijk. Nederlandstalig, speelbaar op laptop, iPad en iPhone.
- Route `/race`, tegel 🏎️ in de GameCenter (`PongWeb/Pages/GameCenter.razor`).

## Architectuur (zelfde aanpak als 2048 en Ultimate)
- **Razor Class Library** `Race`, gehost door de Blazor WebAssembly-app `PongWeb` (één site, één deploy).
  - `PongWeb/App.razor` registreert de assembly via `AdditionalAssemblies` (`ExtraGames`).
  - `PongWeb/wwwroot/index.html` laadt `_content/Race/race.css`.
- `Game/RaceEngine.cs`: pure spellogica in C#: `Start()`, `Tick(dt, steer, throttle)`, botsingen, munten, levens, score. `Frame()` levert een compacte snapshot (`RaceFrame`) om te tekenen. Geen UI-code.
- `Pages/RacePage.razor`: UI (score, overlays, help) + JS-interop. `Tick` is `[JSInvokable]` en wordt elke animatieframe synchroon aangeroepen.
- `wwwroot/race.js`: alleen input (toetsen, pointer), de `requestAnimationFrame`-lus, tekenen op canvas en localStorage.
- `wwwroot/race.css`: alle stijlen met prefix `race-`.

## Regels
- Wereld: weg van x=0 tot 1, zicht van y=0 tot 1,6; speler staat op y=1,3.
- Basissnelheid start op 1,0 en stijgt met 0,02/s tot max 2,6. Gas = +50%, remmen = −50%.
- Verkeer rijdt dezelfde kant op maar langzamer (35–60% van de basissnelheid). Nieuwe auto's verschijnen steeds sneller achter elkaar; er blijft altijd minstens één baan vrij.
- Bij ~35% van de nieuwe auto's verschijnt een munt in een andere vrije baan.
- 3 levens. Botsing: −1 leven, snelheid ×0,4, 2 seconden onkwetsbaar (auto knippert). 0 levens: *Game over*.
- Score = meters (afstand × 20) + 50 per munt. Beste score in localStorage-sleutel `race.best`.

## Besturing
- Toetsenbord: ←/→ of A/D sturen, ↑/W gas, ↓/S remmen.
- Touch/muis: vinger op de weg houden/slepen; de auto stuurt naar de vinger toe.
- Hint toont alleen wat bij het apparaat past (coarse pointer = touch).
- Inklapbare **❓ Hoe speel je?** boven de weg. Houd deze tekst bij als regels veranderen.

## Richtlijnen bij aanpassen
- Spellogica alleen in de engine; de pagina rendert overlays en JS levert input + tekenwerk.
- UI-teksten in het Nederlands, mobiel-vriendelijk.
- Na wijzigingen: build, dit document + changelog bijwerken, commit en push.

## Changelog
- **Basis:** racegame met 4 banen, verkeer, munten, 3 levens, toenemende snelheid, beste score, toetsenbord- en touchbesturing.
- **Help:** inklapbare uitleg "Hoe speel je?".
