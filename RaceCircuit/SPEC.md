# RaceCircuit – Specificatie

## Overzicht
- Route: `/race-circuit` in Sepps GameCenter.
- De pagina host nu een **Unity WebGL** build in een fullscreen iframe.
- Oude custom canvas-implementatie is verwijderd.

## Gameplay-doel (Unity build)
- Racegame met 4 banen en 4 karts.
- Echte spelers vullen beschikbare plekken; overige karts worden door AI bestuurd.
- Camera mag op de eigen kart focussen (niet het hele circuit tegelijk in beeld).

## UI
- Topbar met terugknop en "Open los" link naar de Unity hostpagina.
- Inklapbare hulp: **❓ Hoe speel je?** met uitleg over Unity build-bestanden.
- Fallbackmelding als de Unity build nog niet aanwezig is.

## Architectuur
- Razor Class Library `RaceCircuit`.
- `Pages/RaceCircuitPage.razor`: hostpagina met iframe naar `_content/RaceCircuit/unity/racecircuit/index.html`.
- `wwwroot/racecircuit.css`: fullscreen hostlayout + help-paneel.
- `wwwroot/unity/racecircuit/index.html`: Unity bootstrap/fallback.
- `wwwroot/unity/racecircuit/README.md`: instructies om Unity WebGL build-bestanden te plaatsen.

## Buildbestanden (Unity)
Plaats output van Unity WebGL build in:
- `RaceCircuit/wwwroot/unity/racecircuit/Build/`
- `RaceCircuit/wwwroot/unity/racecircuit/StreamingAssets/` (indien gebruikt)

## Changelog
- **Unity migratie:** RaceCircuit omgezet van custom canvas-game naar Unity WebGL host; oude JS-rendering verwijderd; fallback en build-instructies toegevoegd.
