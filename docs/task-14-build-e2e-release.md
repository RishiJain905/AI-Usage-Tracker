# Task 14: Build Verification, E2E Test & First Release

## Objective
Run the packaging scripts for the first time, verify installers across all platforms, and publish the first GitHub release with auto-updater validation.

## Steps

### 14.1 Fix CI / test environment (Node vs Electron version mismatch)

**Problem:** `better-sqlite3` reports `NODE_MODULE_VERSION 140 vs 127` when running tests in the current Node v22 environment (127), but `electron-builder install-app-deps` rebuilt it for Electron v39 which uses ABI 140.

**Solution options:**
- Option A: Use `electron-rebuild` before tests to rebuild for the test runner's Node version
- Option B: Document that tests must run under the same Node version as Electron's ABI
- Option C: Use separate lockfiles or `--target` flags for native module rebuilds
- **Recommended:** Add a `rebuild:test` script that rebuilds `better-sqlite3` for the current Node version before running tests, and a `rebuild:electron` script for packaging.

```json
"scripts": {
  "rebuild:test": "npm rebuild better-sqlite3 --build-from-source",
  "rebuild:electron": "electron-builder install-app-deps",
  "typecheck": "npm run typecheck:node && npm run typecheck:web",
  "test": "npm run rebuild:test && vitest run"
}
```

Also investigate `.nvmrc` or `engines` field in `package.json` to pin Node versions.

### 14.2 Test Windows packaging

```bash
npm run build:win
```

Verify:
- `dist/ai-usage-tracker-1.0.0-setup.exe` is produced
- Installer allows changing installation directory (NSIS `oneClick: false`)
- Installer creates desktop shortcut
- Installer creates Start Menu shortcut
- Uninstaller removes all files
- App launches from installed location
- System tray icon appears
- Database is created in `%APPDATA%/AI-Usage-Tracker/`
- Proxy starts automatically
- **No "missing module" or DLL errors**

### 14.3 Test macOS packaging

```bash
npm run build:mac
```

On a macOS machine or GitHub Actions runner, verify:
- `dist/AI-Usage-Tracker-1.0.0.dmg` is produced
- DMG opens with app and Applications link layout
- Drag-and-drop to Applications works
- App launches from Applications folder
- Gatekeeper / code signing warnings are acceptable (unsigned dev mode)
- System tray icon appears
- Database is created in `~/Library/Application Support/AI-Usage-Tracker/`

### 14.4 Test Linux packaging

```bash
npm run build:linux
```

On a Linux machine or GitHub Actions runner, verify:
- `dist/ai-usage-tracker-1.0.0.AppImage` is produced
- `dist/ai-usage-tracker_1.0.0_amd64.deb` is produced (Ubuntu/Debian)
- AppImage is executable (`chmod +x`) and launches
- `.deb` installs cleanly with `dpkg -i`
- System tray icon appears
- Database is created in `~/.config/ai-usage-tracker/`

### 14.5 Verify native module bundling

After packaging, inspect the `app.asar` or output directory:
- `better-sqlite3` native `.node` file is present alongside the unpacked `resources/`
- `better_sqlite3.node` loads without `MODULE_NOT_FOUND` error when app launches
- If crashes occur, check `asarUnpack` paths in `electron-builder.yml`

### 14.6 Manual installer smoke tests

Create a checklist for each platform:

```
- [ ] Package builds without errors
- [ ] Installer runs to completion
- [ ] App launches from installed location (not dev mode)
- [ ] Main window renders React UI
- [ ] Proxy auto-starts and accepts connections
- [ ] System tray icon is visible and functional
- [ ] Database file is created and writable
- [ ] No console errors on startup
- [ ] Quit action cleans up (closes DB, stops proxy)
```

### 14.7 Create and push first release tag

```bash
git tag v1.0.0 -m "Initial release"
git push origin v1.0.0
```

This triggers the `.github/workflows/build.yml` CI pipeline.

### 14.8 Verify CI pipeline

Monitor the GitHub Actions run:
- All 3 OS jobs complete successfully
- Artifacts uploaded: `windows-latest-build`, `macos-latest-build`, `ubuntu-latest-build`
- Download and inspect artifacts from each platform

### 14.9 Publish GitHub Release

Create a GitHub Release from tag `v1.0.0`:
- Attach platform-specific installers from CI artifacts
- Write release notes:
  - Feature list (all 13 tasks)
  - Supported providers
  - Installation instructions per platform
  - Known issues (e.g., unsigned builds on macOS)
- Mark as stable release

### 14.10 Test auto-updater end-to-end

After the release is published:
1. Install an older version locally (or temporarily bump version to `0.9.9`)
2. Run the app
3. Click "Check for Updates" in Settings > About
4. Verify electron-updater detects the newer `v1.0.0` on GitHub
5. Verify "Update available" notification appears
6. Download the update
7. Verify "Restart to install" prompt appears
8. Verify app restarts with the new version

```yaml
# electron-builder.yml must have:
publish:
  provider: github
  owner: terratch
  repo: ai-usage-tracker
```

### 14.11 Update Settings > About page for real updater UI

The current `About.tsx` has a placeholder message for the updater. Update it to:
- Show actual update status (checking, available, not available, downloading, downloaded)
- Show download progress bar when `update-download-progress` fires
- Add "Download Update" button when `update-available` fires
- Add "Restart to Install" button when `update-downloaded` fires
- Show error message when `update-error` fires

### 14.12 Fix any packaging issues found

Document any issues encountered and fix them:
- Additional `asarUnpack` paths needed
- Missing files in the package
- Permission issues on database directory
- Native module path resolution issues

## Verification
- [ ] `npm run build:win` produces a working .exe installer
- [ ] `npm run build:mac` produces a working .dmg
- [ ] `npm run build:linux` produces a working .AppImage
- [ ] CI pipeline builds successfully on all platforms
- [ ] GitHub Release contains all platform installers
- [ ] `git tag v1.0.0` pushed and CI triggered
- [ ] Auto-updater detects and downloads updates from GitHub Release
- [ ] Settings > About page shows real updater status
- [ ] All native modules load correctly in packaged builds

## Dependencies
- Task 13 (Packaging configuration completed)
- Access to GitHub Actions CI runners
- A macOS machine or CI runner to test macOS packaging
- A Linux machine or CI runner to test Linux packaging

## After AI Completion: Human Checklist

After the AI agent reports Task 14 done, the following items **must** be verified by a human before the app is considered release-ready:

### Must verify manually (no AI substitute)
- [ ] **Run the Windows installer on a clean Windows VM/machine** — confirm the .exe installs, launches, and the app works end-to-end
- [ ] **Test macOS packaging** — `npm run build:mac` must be run on a real Mac; verify DMG opens, app launches, no Gatekeeper hard-block
- [ ] **Test Linux packaging** — `npm run build:linux` must be run on a real Linux box (or WSL); verify AppImage and .deb work
- [ ] **Approve the v1.0.0 tag** — the AI will suggest a tag, but a human must decide if the codebase is actually ready to ship
- [ ] **Write release notes** — AI can draft, but feature descriptions, screenshots, and tone need human authorship
- [ ] **Decide on macOS code signing** — Apple Developer account ($99+/year) is required for signed/notarized builds; unsigned builds will show scary warnings

### Should verify after AI reports done
- [ ] CI pipeline actually produced artifacts on all 3 platforms (check GitHub Actions page)
- [ ] Download one artifact per platform and confirm it's a valid installer, not just an empty file
- [ ] Run the auto-updater test: install a temp v0.9.9, check if it detects v1.0.0 on GitHub
- [ ] Check that Settings > About shows the correct app version and database path

### Known limitations AI cannot overcome
- **No macOS or Linux machine available** — AI runs on Windows only; those platforms require CI or your own hardware
- **No Apple Developer account** — macOS notarization requires real credentials; AI cannot create or fund one
- **No real clean-install VMs** — AI cannot verify installer behavior on a machine that has never had Node/Electron installed

## Estimated Time
3-4 hours (assuming CI works; longer if build debugging is needed)
