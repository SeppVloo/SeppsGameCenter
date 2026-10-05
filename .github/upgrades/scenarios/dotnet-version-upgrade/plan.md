# .NET Version Upgrade Plan

## Overview

**Target**: Upgrade all projects in SeppsGameCenter.slnx from net10.0 to net11.0 and update all NuGet packages to their latest stable versions
**Scope**: 7 SDK-style projects, ~4.4k LOC (2 Blazor WebAssembly apps, 1 Razor class library, 2 WinForms apps, 2 console apps)

### Selected Strategy
**All-At-Once** — All projects upgraded simultaneously in a single operation.
**Rationale**: 7 projects, all on .NET 10, SDK-style, shallow dependency graph (PongWeb → Game2048), all packages compatible.

## Tasks

### 01-prerequisites: Verify .NET 11 SDK and toolchain

Confirm the .NET 11 SDK is installed and usable, and that no global.json pins an older SDK. The solution has no global.json, so only SDK availability needs verifying.

**Done when**: `dotnet --list-sdks` shows an 11.x SDK and the SDK validation tool reports a compatible SDK.

---

### 02-upgrade-all-projects: Upgrade all projects to net11.0 and update packages

Update the TargetFramework of all 7 projects (Game2048, PongWeb, Sepp2048Web, SeppConsoleApp, SteenPapierSchaar to `net11.0`; PongWinForms and SeppWinFormsApp to `net11.0-windows`). Bump all explicit PackageReferences (Microsoft.AspNetCore.Components.Web, Microsoft.AspNetCore.Components.WebAssembly, ...WebAssembly.DevServer, Microsoft.Extensions.DependencyInjection, plus any in Sepp2048Web) to the latest stable versions available for .NET 11.

The assessment reports 2086 binary/214 source incompatibilities, nearly all in the WinForms projects — these are WinForms/System.Drawing APIs that resolve once the `-windows` TFM is retained. PongWeb and Sepp2048Web have a few behavioral-change flags (Blazor WebAssembly) to review. Check Blazor WASM project settings and .NET 11 breaking changes for ASP.NET Core/Blazor.

**Done when**: All projects target net11.0(-windows), all packages are at latest stable, and the full solution builds with 0 errors and 0 warnings.

---

### 03-final-validation: Validate full solution

Run a full solution rebuild and any tests. Update PongWeb/SPEC.md changelog to record the framework upgrade (per repo guidelines).

**Done when**: Solution builds clean, tests (if any) pass, SPEC.md changelog updated.
