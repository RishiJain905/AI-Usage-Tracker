# Task 13: Packaging, Build & Distribution

## Objective
Configure the build pipeline for creating distributable packages (Windows installer, macOS DMG, Linux AppImage) and set up auto-update functionality.

## Steps

### 13.1 Configure electron-builder

File: `electron-builder.yml` (or in package.json)

```yaml
appId: com.ai-usage-tracker.app
productName: AI Usage Tracker
copyright: Copyright © 2024

directories:
  output: dist
  buildResources: resources

files:
  - "!**/.vscode/*"
  - "!src/*"
  - "!docs/*"
  - "!electron.vite.config.*"
  - "!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}"
  - "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  icon: resources/icon.png
  category: Development

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: AI Usage Tracker

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

### 13.2 Create application icons

Generate icons in all required formats:
- `icon.ico` — Windows (256x256, includes 16/32/48/256 sizes)
- `icon.icns` — macOS (includes 16/32/128/256/512 sizes)
- `icon.png` — Linux (512x512)
- `tray-icon.png` — Tray icon (16x16, 32x32)
- `tray-iconTemplate.png` — macOS tray (monochrome template)

Design guidelines:
- Simple, recognizable at small sizes
- Token/counter metaphor (e.g., a small chart icon or "AT" monogram)
- Works on both light and dark backgrounds
- 16x16 must still be readable

### 13.3 Configure auto-updates

Use `electron-updater` for automatic updates:

```bash
npm install electron-updater
```

File: `src/main/updater.ts`

```typescript
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    // Notify user: "Update available: v1.x.x"
    // Show download button in UI
  });

  autoUpdater.on('download-progress', (progress) => {
    // Update progress bar in UI
  });

  autoUpdater.on('update-downloaded', () => {
    // Prompt: "Restart to install update?"
    autoUpdater.quitAndInstall();
  });
}
```

For initial release, use GitHub Releases as the update source:
```yaml
# electron-builder.yml
publish:
  provider: github
  owner: your-github-username
  repo: ai-usage-tracker
```

### 13.4 Add build scripts

Update `package.json`:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",
    "build:all": "npm run build && electron-builder --win --mac --linux",
    "release": "npm run build && electron-builder --publish always"
  }
}
```

### 13.5 Configure code signing (macOS)

For macOS distribution:
- Apple Developer ID certificate required for notarization
- Configure `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables
- Enable notarization:

```yaml
# electron-builder.yml
mac:
  hardenedRuntime: true
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist

afterSign: scripts/notarize.js
```

File: `scripts/notarize.js` — Uses `electron-notarize` to notarize the app.

### 13.6 Handle native module rebuilds

`better-sqlite3` is a native module that needs to be rebuilt for Electron:

```json
{
  "postinstall": "electron-builder install-app-deps"
}
```

Verify this works correctly in CI builds. If issues arise, add explicit configuration:

```yaml
# electron-builder.yml
npmRebuild: true
```

### 13.7 Set up CI/CD (GitHub Actions)

File: `.github/workflows/build.yml`

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install

      - run: npm run build

      - name: Build Electron app
        run: npm run build:win  # or :mac / :linux based on OS
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: dist/
```

### 13.8 Add app metadata

File: `src/main/index.ts`

Set proper app metadata:
```typescript
app.setAboutPanelOptions({
  applicationName: 'AI Usage Tracker',
  applicationVersion: app.getVersion(),
  copyright: '© 2024',
  authors: ['Your Name'],
  website: 'https://github.com/your-username/ai-usage-tracker',
});
```

### 13.9 Create installer splash screen (optional)

For Windows NSIS installer, add a custom splash:
- `resources/installer.bmp` — 150x57 pixel bitmap shown during install
- `resources/uninstaller.bmp` — Same for uninstall

### 13.10 Test distribution packages

Before releasing:
- Install the Windows .exe on a clean Windows machine
- Install the macOS .dmg on a clean Mac
- Install the Linux .AppImage on a clean Linux distro
- Verify:
  - App launches correctly
  - Proxy starts automatically
  - No missing native modules
  - Auto-updater detects current version
  - System tray works
  - Database is created in correct location
  - File permissions are correct (especially for DB writes)

### 13.11 Create first release

1. Tag the release: `git tag v1.0.0 -m "Initial release"`
2. Push tag: `git push origin v1.0.0`
3. CI builds all platforms and creates a GitHub Release
4. Write release notes with:
   - Features list
   - Supported providers
   - Installation instructions per platform
   - Known issues

## Verification
- `npm run build:win` produces a valid .exe installer
- `npm run build:mac` produces a valid .dmg
- `npm run build:linux` produces a valid .AppImage
- Installer creates desktop/start menu shortcuts (Windows)
- App launches from installed location
- All native modules (better-sqlite3) load correctly
- Auto-updater checks for updates on launch
- CI pipeline builds successfully on all platforms
- GitHub Release contains all platform installers

## Dependencies
- All previous tasks (the complete application)

## Estimated Time
3-4 hours
