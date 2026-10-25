# Tik, tak, toe (Ultimate) — Spec

## Overzicht
Ultimate tik-tak-toe voor 2–4 spelers, gehost in de Sepps GameCenter (`PongWeb`).
Spelers kunnen mensen op hetzelfde apparaat, mensen op andere apparaten (wifi of internet) of computerspelers zijn.

## Architectuur
| Onderdeel | Bestand | Taak |
|---|---|---|
| Spellogica | `Game/UltimateEngine.cs` | Pure C#: bord, regels, winnaar, (de)serialisatie, computerspeler. Geen UI. |
| Pagina | `Pages/UltimateTttPage.razor` | Route `/ultimate`: lobby, bord, beurten, AI-lus, netwerk-callbacks. |
`pushState`, `sendMove`, `pushCmd`
| Opmaak | `wwwroot/ultimate.css` | Geladen via `PongWeb/wwwroot/index.html` (`_content/UltimateTtt/ultimate.css`). |
| Host | `PongWeb/App.razor`, `PongWeb/Pages/GameCenter.razor` | Assembly in `AdditionalAssemblies`; tegel ⭕ in de GameCenter. |

- **Host-authoritative**: alleen de host (of het lokale apparaat) voert `Play` uit en laat computers zetten.
- Host → clients: `state { g, n }`; `g` = `UltimateEngine.Serialize()`, `n` = spelersnamen.
- Client → host: `input` met `y = b*9+c` (bord b, vakje c) en `slot` = spelende plek. De host controleert dat die plek aan de beurt is en geen computer is.
- Naam wordt gedeeld met Pong via localStorage-sleutel `pongName`.

## Spelvorm
(standaard: Standaard)
- Standaard: één 3×3-bord (intern klein bord 0, `Forced = 0`), 3 op een rij wint, vol bord = gelijkspel. Werkt met dezelfde spelers, computers, toetsenbord en netwerk.
- De spelvorm zit in de snapshot (`Classic`, 9e veld) zodat andere apparaten het juiste bord tonen.

## Regels
1. Het grote bord bestaat uit 9 kleine 3×3-borden (b = 0..8, vakje c = 0..8, links-boven naar rechts-onder).
2. Drie op een rij (horizontaal, verticaal, diagonaal) in een klein bord wint dat bord. Een vol bord zonder winnaar is gelijk (telt voor niemand).
3. Spelen in vakje c stuurt de volgende speler naar klein bord c. Is dat bord gewonnen of vol, dan mag de volgende speler in elk open bord spelen.
4. De eerste zet is vrij.
5. Drie gewonnen kleine borden op een rij wint het spel.
6. Zijn alle kleine borden beslist zonder rij: wie de meeste kleine borden heeft wint; bij gelijke stand is het gelijkspel.
7. 2–4 spelers spelen om de beurt met eigen teken en kleur: ✕ blauw, ◯ oranje, △ groen, ▢ paars. Wie begint wordt willekeurig gekozen.

## Spelers en lobby
- Tab **🎮 Nieuw spel**: kies 2, 3 of 4 spelers.
  - Plek 1 = jij (naam invulbaar).
  - Plekken 2–4: tik om te wisselen 🤖 computer → 📱 op dit apparaat → 🌐 ander apparaat.
  - Max. 2 spelers op één apparaat; dus tot 3 computers.
  - Computerniveau per plek: 😊 makkelijk (willekeurig), 🙂 normaal (heuristiek), 😈 moeilijk (heuristiek + één zet vooruit kijken).
  - Geen 🌐 plekken → het spel start direct lokaal. Met 🌐 plekken → kies 📶 wifi of 🌍 internet en wacht tot alle plekken bezet zijn.
- Tab **🤝 Meedoen**: kies wifi/internet, 1 of 2 spelers op dit apparaat (met namen) en tik op een gevonden spel.
- Verlaat een speler op afstand het spel, dan neemt de computer (normaal) zijn plek over.
- Alleen de host kan na afloop "↻ Nog een keer" kiezen.

## Bediening en weergave
- Tik/klik op een vakje om te spelen; alleen speelbare vakjes zijn klikbaar en lichter.
- Het bord waar gespeeld moet worden licht geel op.
- De laatste zet heeft een witte rand; een gewonnen klein bord toont groot het teken van de winnaar.
- Bovenaan staan de spelers met aantal gewonnen borden; wie aan de beurt is, licht op. Een tekstregel zegt wie waar moet spelen.
- Toetsenbord (laptop): pijltjes/WASD verplaatsen een blauw kader over het bord (blijft binnen het verplichte bord), Enter/spatie speelt, 1-9 kiest direct een vakje in het actieve bord. Het bord krijgt automatisch focus bij de start.
- Op één apparaat geef je het toestel door aan wie aan de beurt is.
- Computers wachten ±0,6 s voor hun zet zodat je kunt volgen.

## Help
In het spel staat "❓ Hoe speel je?" met de regels en de opzet; houd die gelijk met deze spec.

## Changelog
- v1: eerste versie (2–4 spelers, computerspelers, lokaal + wifi/internet).
- v1.1: ontbrekende stylesheet toegevoegd; groter, duidelijker bord (oplichtend actief bord, kleuren per speler).
- v1.2: spec volledig uitgeschreven.
- v1.3: stylesheet echt weggeschreven (was leeg); bord schaalt mee met schermhoogte.
toetsenbordbesturing toegevoegd.
- v1.5: keuze tussen Standaard en Ultimate tik-tak-toe.
- v1.6: Standaard is de voorgeselecteerde spelvorm.
- v1.7: "← Stoppen" tijdens het spel (of wachten) brengt je terug naar het beginscherm van het spel i.p.v. de GameCenter.
