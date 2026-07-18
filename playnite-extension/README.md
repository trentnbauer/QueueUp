# QueueUp Importer (Playnite extension)

Pushes your [Playnite](https://playnite.link/) library to your self-hosted [QueueUp](../README.md)
instance. Unlike Steam import (which QueueUp pulls directly from Steam's Web API), Playnite has no
hosted account of its own — this extension runs inside Playnite and sends your library to QueueUp
instead, so it works for anything Playnite aggregates (Steam, GOG, Epic, emulators, manually-added
entries), matched to QueueUp's game data by title.

## Setup

1. In QueueUp, open **Profile Settings → Playnite import** and click **Generate token**. Copy it —
   it's only shown once.
2. In Playnite, install this extension (see Building/Installing below), then open its settings
   (Add-ons → Extensions → QueueUp Importer → Settings) and fill in:
   - **QueueUp server URL** — your instance's base URL (e.g. `https://queueup.example.com`), no
     trailing slash.
   - **API token** — the token from step 1.
3. From Playnite's main menu, run **QueueUp → Sync library to QueueUp**. This can be re-run any
   time to pick up newly added games; games already on your QueueUp shelf are skipped.

Revoking or regenerating the token in QueueUp's Profile Settings invalidates whatever's pasted into
the extension until you update it there too.

## Building

Requires the .NET SDK (targets `net462`, matching Playnite's own runtime) and the `PlayniteSDK`
NuGet package (pulled automatically on build).

```
dotnet build -c Release
```

## Packaging / installing

Playnite extensions install as a `.pext` file — a zip of the build output (the compiled DLL,
`extension.yaml`, and any dependencies) with a `.pext` extension instead of `.zip`. Playnite's own
[Toolbox](https://playnite.link/docs/master/tutorials/extensions_debugging.html) can build this
package for you; alternatively, zip `bin/Release/net462/*` (including `extension.yaml`) and rename
it to `QueueUpImporter.pext`, then double-click it (or use Playnite's Add-ons → Install from file)
to install.

## Note

This extension was scaffolded against the documented Playnite SDK plugin pattern (`GenericPlugin`,
`ISettings`, main menu items) but has not been compiled or run against a real Playnite installation
in this environment — no .NET SDK or Playnite instance was available here. Build and do a live sync
test before relying on it.
