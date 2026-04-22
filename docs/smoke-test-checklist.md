# Smoke Test Checklist

## Windows
- [ ] Package builds without errors (`npm run build:win`)
- [ ] Installer runs to completion
- [ ] App launches from installed location (not dev mode)
- [ ] Main window renders React UI
- [ ] Proxy auto-starts and accepts connections
- [ ] System tray icon is visible and functional
- [ ] Database file is created and writable in %APPDATA%/AI-Usage-Tracker/
- [ ] No console errors on startup
- [ ] Quit action cleans up (closes DB, stops proxy)

## macOS (CI only — requires real Mac for full verification)
- [ ] `npm run build:mac` succeeds on CI
- [ ] DMG artifact produced by GitHub Actions
- [ ] Human: verify DMG opens, app launches, no Gatekeeper hard-block

## Linux (CI only — requires real Linux for full verification)
- [ ] `npm run build:linux` succeeds on CI
- [ ] AppImage and .deb artifacts produced by GitHub Actions
- [ ] Human: verify AppImage launches, .deb installs cleanly
