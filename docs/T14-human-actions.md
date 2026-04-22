# Task 14: Remaining Human Actions

These items require manual human execution — AI cannot complete them due to environment limitations or decision authority.

---

## Must Do Before Release

### 1. Push the `v1.0.0` Tag
```bash
git tag v1.0.0 -m "Initial release"
git push origin v1.0.0
```
This triggers the CI pipeline to build all platform installers.

### 2. Monitor CI Pipeline
- Go to **GitHub Actions** in the `terratch/ai-usage-tracker` repo
- Verify all 3 OS jobs complete successfully: `windows-build`, `macos-build`, `linux-build`
- Download one artifact per platform and confirm it is a valid installer (not empty)

### 3. Run the Windows Installer on a Clean Machine
Use the `docs/smoke-test-checklist.md` as your guide:
- [ ] Installer runs to completion
- [ ] App launches from installed location
- [ ] Main window renders React UI
- [ ] Proxy auto-starts and accepts connections
- [ ] System tray icon is visible and functional
- [ ] Database file created in `%APPDATA%/AI-Usage-Tracker/`
- [ ] No console errors on startup
- [ ] Quit action cleans up (closes DB, stops proxy)

### 4. Create or Verify GitHub Release
The CI `release` job will auto-create a draft release when the `v1.0.0` tag is pushed. If it doesn't:
1. Go to **Releases → Draft a new release**
2. Select tag `v1.0.0`
3. Copy content from `docs/release-notes-v1.0.0.md` into the release body
4. Upload platform installers from CI artifacts if not auto-attached
5. Mark as **stable release**

### 5. Test Auto-Updater End-to-End
After the GitHub Release is published:
1. Temporarily set app version to `0.9.9` in `package.json`
2. Build and install the `0.9.9` version locally
3. Launch the app, go to **Settings > About**
4. Click **Check for Updates**
5. Verify "Update available: v1.0.0" appears
6. Click **Download update** — watch progress bar
7. Click **Restart to install** — verify app restarts as v1.0.0
8. Revert `package.json` version back to `1.0.0`

---

## Should Do (Platform Verification)

### 6. Test macOS Build (requires Mac or CI access)
- [ ] `npm run build:mac` produces a `.dmg` on CI
- [ ] DMG opens with app and Applications link layout
- [ ] Drag-and-drop to Applications works
- [ ] App launches (Gatekeeper warning acceptable for unsigned builds)
- [ ] System tray icon appears

### 7. Test Linux Build (requires Linux or CI access)
- [ ] `npm run build:linux` produces `.AppImage` + `.deb` on CI
- [ ] AppImage is executable and launches
- [ ] `.deb` installs cleanly with `dpkg -i`
- [ ] System tray icon appears

---

## Decision Items

### 8. macOS Code Signing
Unsigned builds will show a Gatekeeper security warning on macOS. To eliminate this:
- Requires an **Apple Developer account** ($99+/year)
- Must configure `CSC_LINK` and `CSC_KEY_PASSWORD` as GitHub secrets
- The `notarize.js` script and `entitlements.mac.plist` are already in place from Task 13
- **Without signing:** users must right-click → Open on first launch

### 9. Approve Release Readiness
Review the full feature set (Tasks 1–13) and decide whether the codebase is ready to ship as v1.0.0. The AI has verified all automated checks pass, but only you can judge if the UX is polished enough for users.

---

## Known Limitations

| Limitation | Reason |
|-----------|--------|
| No macOS local testing | AI runs on Windows only |
| No Linux local testing | AI runs on Windows only |
| No Apple Developer account | Requires real credentials and payment |
| No clean-install VM testing | AI cannot verify installer on a pristine machine |
| No auto-updater E2E without a release | Updater needs a published GitHub Release to detect updates |
