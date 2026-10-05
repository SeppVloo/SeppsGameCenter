# 01-prerequisites: Verify .NET 11 SDK and toolchain

Confirm the .NET 11 SDK is installed and usable, and that no global.json pins an older SDK. The solution has no global.json, so only SDK availability needs verifying.

**Done when**: `dotnet --list-sdks` shows an 11.x SDK and the SDK validation tool reports a compatible SDK.
