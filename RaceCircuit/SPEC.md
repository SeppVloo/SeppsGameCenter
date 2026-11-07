# RaceCircuit – Specificatie

## Overzicht
- Nieuwe racegame op route `/race-circuit` in Sepps GameCenter.
- Volledig scherm met bovenaanzicht van een circuit.
- Altijd 4 banen en 4 karts.
- Echte spelers: instelbaar 1 t/m 4 op hetzelfde apparaat.
- Niet-gevulde plekken worden automatisch bestuurd door de computer.

## Gameplay
- Elke kart rijdt 3 rondes.
- Hoogste positie bepaalt de tussenstand; eerste over de finish wint.
- Menselijke spelers kunnen van baan wisselen en gas/remmen.
- Computerkarts rijden automatisch en zoeken waar mogelijk vrije banen.

## Besturing
- Speler 1: W/A/S/D
- Speler 2: pijltjestoetsen
- Speler 3: I/J/K/L
- Speler 4: T/F/G/H

## UI
- Overlay met terugknop, speler-keuze en knop "Nieuwe race".
- Statusbalk met live tussenstand.
- Inklapbare hulp: **❓ Hoe speel je?**

## Architectuur
- Razor Class Library `RaceCircuit`.
- `Pages/RaceCircuitPage.razor`: UI + JS-interop.
- `wwwroot/racecircuit.js`: game-loop, input, AI, render op canvas.
- `wwwroot/racecircuit.css`: full-screen layout en overlay-styling.

## Changelog
- **Basis toegevoegd:** nieuw project RaceCircuit met full-screen top-down circuit, 4 banen, 4 karts, lokale spelersselectie en AI-opvulling, plus in-game helptekst.
