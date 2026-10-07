# SI DJ Bridge Packaging

The Bridge is packaged as a standalone Electron desktop application. DJs do not need Node.js or a terminal to run it.

## Release artifacts

Every `bridge-v*` tag triggers GitHub Actions to build:

- `SI-DJ-Bridge.dmg` — universal Mac installer for Intel and Apple Silicon
- `SI-DJ-Bridge-Setup.exe` — Windows x64 installer

The workflow publishes both files to the GitHub Release. The website download page points to the latest release assets.

## Local build

Install dependencies and build the desktop app:

```bash
npm install
npm run bridge:package
```

The Mac installer is written to `release/SI-DJ-Bridge.dmg`.

For Windows, run Electron Builder on Windows:

```bash
npm install
npx electron-builder --win nsis --publish never
```

## Production signing

The application is structurally ready for signing, but production signing credentials must be configured before commercial distribution.

Mac signing/notarization requires Apple Developer ID credentials. Windows signing requires a trusted Authenticode certificate. Credentials must never be committed to the repository.

## Bridge architecture

The desktop app starts the local Bridge service automatically and keeps the service bound to `127.0.0.1:8765`. The service exposes health, configuration and now-playing endpoints locally.

Current connectors:

- VirtualDJ live now-playing
- Rekordbox history-file connector
- Serato planned

The desktop UI communicates with the service through Electron IPC; the browser never needs Node.js installed.
