# RaceCircuit – Specificatie

## Overzicht
- Route: `/race-circuit` in Sepps GameCenter.
- Fullscreen 3D racegame met **Babylon.js** (in-browser).
- Altijd 4 banen en 4 karts.

## Gameplay
- 1 t/m 4 echte spelers op hetzelfde apparaat.
- Niet-gevulde plekken worden automatisch bestuurd door AI.
- Doel: als eerste 3 rondes finishen.
- Volgcamera achter de eigen kart.
- Contact tussen karts geeft lichte duw en snelheidsverlies.

## Besturing
- Speler 1: W/A/S/D
- Speler 2: pijltjestoetsen
- Speler 3: I/J/K/L
- Speler 4: T/F/G/H

## UI
- Topbar met terugknop, spelerskeuze en knop "Nieuwe race".
- Statusregel met positie, ronde en snelheid.
- Inklapbare hulp: **❓ Hoe speel je?**

## Architectuur
- Razor Class Library `RaceCircuit`.
- `Pages/RaceCircuitPage.razor`: pagina met canvas + JS-interop.
- `wwwroot/racecircuit.js`: Babylon scene, karts, AI, camera en race-loop.
- `wwwroot/racecircuit.css`: fullscreen canvas layout + overlays.

## Changelog
- **Babylon migratie:** Unity-host verwijderd en vervangen door een direct speelbare Babylon.js 3D race-implementatie met 4 banen, 4 karts, lokale spelers en AI-opvulling.
