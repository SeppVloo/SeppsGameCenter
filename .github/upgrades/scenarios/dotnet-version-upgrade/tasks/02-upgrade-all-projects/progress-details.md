# 02-upgrade-all-projects — Progress Details

## Changes
- All 7 projects retargeted: `net10.0` → `net11.0` (Game2048, PongWeb, Sepp2048Web, SeppConsoleApp, SteenPapierSchaar), `net10.0-windows` → `net11.0-windows` (PongWinForms, SeppWinFormsApp).
- Packages `10.0.12` → `11.0.0-rc.1.26425.128` (Microsoft.AspNetCore.Components.Web, .WebAssembly, .WebAssembly.DevServer, Microsoft.Extensions.DependencyInjection). No stable 11.x exists yet; rc.1 matches the installed SDK/runtime (required for Blazor WASM).
- Environment: user NuGet config had no nuget.org source (only VS offline packages) → added `https://api.nuget.org/v3/index.json`.

## Warnings fixed (52 → 0)
- BL0016 (new .NET 11 Blazor analyzer, unguarded JS interop): PongWeb `Pong.razor` now uses guarded helpers `JsVoid`/`JsGet<T>`; `net.js` start null-checked. Game2048 `Game2048Page.razor` init/save wrapped in try/catch.
- CS8618: `[MemberNotNull]` on `CreateMenu`/`CreateHangmanBox` (PongWinForms MainForm, SeppWinFormsApp Galgje); `SettingsForm.Result` made `GameSettings?` (callers already null-check).
- CS0169/CS0414: removed unused fields `_netStarted`, `_clientLastSeenPowerEventSeq`, `_leftPaddleBuffFactor`, `_rightPaddleBuffFactor` in PongWinForms MainForm.
- CS8602: null-safe `me` access in Sepp2048Web `Multiplayer.razor`.

## Build
`dotnet build SeppsGameCenter.slnx --no-incremental`: 0 errors, 0 warnings.

## Docs
PongWeb/SPEC.md: type → .NET 11, changelog entry added.
