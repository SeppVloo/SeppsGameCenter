# 02-upgrade-all-projects: Upgrade all projects to net11.0 and update packages

Update the TargetFramework of all 7 projects (Game2048, PongWeb, Sepp2048Web, SeppConsoleApp, SteenPapierSchaar to `net11.0`; PongWinForms and SeppWinFormsApp to `net11.0-windows`). Bump all explicit PackageReferences (Microsoft.AspNetCore.Components.Web, Microsoft.AspNetCore.Components.WebAssembly, ...WebAssembly.DevServer, Microsoft.Extensions.DependencyInjection, plus any in Sepp2048Web) to the latest stable versions available for .NET 11.

The assessment reports 2086 binary/214 source incompatibilities, nearly all in the WinForms projects — these are WinForms/System.Drawing APIs that resolve once the `-windows` TFM is retained. PongWeb and Sepp2048Web have a few behavioral-change flags (Blazor WebAssembly) to review. Check Blazor WASM project settings and .NET 11 breaking changes for ASP.NET Core/Blazor.

**Done when**: All projects target net11.0(-windows), all packages are at latest stable, and the full solution builds with 0 errors and 0 warnings.
