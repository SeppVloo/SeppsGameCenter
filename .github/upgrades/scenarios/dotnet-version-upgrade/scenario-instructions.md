# .NET Version Upgrade

## Preferences
- **Flow Mode**: Automatic
- **Target Framework**: net11.0 (.NET 11 RC1, go-live support; user confirmed .NET 11 is no longer considered preview)
- **Scope**: Entire solution (SeppsGameCenter.slnx, all projects)
- **NuGet packages**: Upgrade all packages to latest stable versions

## Source Control
- **Source Branch**: master
- **Working Branch**: master (work directly on master, per user)
- **Commit Strategy**: After Each Task
- **Branch Sync**: Auto (Merge)

## Upgrade Options
- **Strategy**: All-At-Once

## Strategy
**Selected**: All-At-Once
**Rationale**: 7 SDK-style projects all on net10.0, shallow dependency graph, all packages compatible.

### Execution Constraints
- Single atomic upgrade — all projects updated together (TFMs, then packages, then restore/build/fix)
- Validate full solution build (0 errors, 0 warnings) after the upgrade
- Testing comes after the atomic upgrade succeeds

## Key Decisions Log
- User chose .NET 11 and installed the .NET 11 SDK themselves.
- Session 2: user confirmed net11.0, whole solution, all packages to latest stable, work directly on master, Automatic, commit per task (kept over All-At-Once default).
- Session 3: .NET 11 SDK installed and validated; proceeding.
