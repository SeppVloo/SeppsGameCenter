# Unity WebGL build plaatsen

Deze map host de Unity WebGL game binnen de Blazor-app.

## Stap 1: Build in Unity
- Open je Unity project
- Build target: **WebGL**
- Compressie: bij voorkeur **Brotli**
- Productnaam/buildnaam: **RaceCircuit** (zodat de bestandsnamen matchen)

## Stap 2: Kopieer output
Kopieer de Unity-output naar:

- `RaceCircuit/wwwroot/unity/racecircuit/Build/`
- `RaceCircuit/wwwroot/unity/racecircuit/StreamingAssets/` (indien aanwezig)
- eventueel `TemplateData/` als je dat gebruikt

## Verwachte kernbestanden in Build
- `RaceCircuit.loader.js`
- `RaceCircuit.data.br` (of `.data.gz` / `.data`)
- `RaceCircuit.framework.js.br` (of variant)
- `RaceCircuit.wasm.br` (of variant)

## Let op
Als je andere bestandsnamen gebruikt, pas dan de paden aan in `index.html`.
