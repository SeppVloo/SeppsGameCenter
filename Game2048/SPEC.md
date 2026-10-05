# Game2048 – Specificatie

> Houd dit document bij bij elke nieuwe of gewijzigde spec (incl. changelog), in dezelfde commit als de code.

## Overzicht
- Klassiek 2048 (4x4), Nederlandstalig, speelbaar op laptop, iPad en iPhone.
- Route `/2048`, tegel in de GameCenter (`PongWeb/Pages/GameCenter.razor`).

## Architectuur (zelfde aanpak als Pong)
- **Razor Class Library** `Game2048` (net10.0), gehost door de Blazor WebAssembly-app `PongWeb` (één site, één deploy).
  - `PongWeb/App.razor` registreert de assembly via `AdditionalAssemblies` (`ExtraGames`).
  - `PongWeb/wwwroot/index.html` laadt `_content/Game2048/game2048.css`.
- `Game/Game2048Engine.cs`: pure spellogica in C# (zoals `PongEngine`): `Move(Direction)`, `Reset()`, score, winst, game over. Geen UI-code.
- `Pages/Game2048Page.razor`: UI + JS-interop. Tegels hebben een vast `Id` (`@key`) zodat ze met CSS-transities schuiven.
- `wwwroot/game2048.js`: alleen input (pijltjes, W/A/S/D, swipe) en localStorage; roept `OnMove` in C# aan.
- `wwwroot/game2048.css`: alle stijlen met prefix `g2048-` (geen botsing met Pong-CSS).

## Regels
- Na elke geldige zet verschijnt een 2 (90%) of 4 (10%) op een leeg vak.
- Per zet kan een tegel maar één keer samensmelten. Score = som van alle samengesmolten waarden.
- 2048 bereikt: melding met *Doorspelen* of *Nieuw spel*. Geen zet meer mogelijk: *Game over*.
- Beste score wordt bewaard in localStorage-sleutel `g2048.best`.

## Besturing
- Toetsenbord: pijltjes of W/A/S/D. Touch: vegen op het bord (minimaal 24px).
- Hint toont alleen wat bij het apparaat past (coarse pointer = touch).

## Richtlijnen bij aanpassen
- Spellogica alleen in de engine; de pagina rendert en JS levert alleen input.
- UI-teksten in het Nederlands, mobiel-vriendelijk.
- Na wijzigingen: build, dit document + changelog bijwerken, commit en push.

## Changelog
- **Eerste versie:** 2048 als nieuwe RCL naast Pong, solo, swipe/toetsen, animaties, beste score.
