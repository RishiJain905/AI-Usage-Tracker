# Task 15: Quality Assurance, Documentation & Final Polish

## Objective
Fix remaining quality issues, replace placeholder assets, complete documentation, and ensure the app is production-ready.

## Steps

### 15.1 Replace placeholder icons with professional design

Current icons are programmatically generated (simple chart bars on a gradient).
Replace with professionally designed icons:

1. Source a designer or use a design tool (Figma, Illustrator) to create:
   - `resources/icon.png` — 512x512 (primary source)
   - `resources/icon.ico` — Windows format (multi-size: 16, 32, 48, 256)
   - `resources/icon.icns` — macOS format (multi-size: 16, 32, 128, 256, 512, 1024)

2. Design guidelines:
   - AI / token tracking metaphor (e.g., neural network node, token counter, small chart)
   - Works at 16x16 (system tray) and 512x512 (app icon)
   - Readable in both light and dark themes
   - Consistent with tray icons (currently `tray-icon-16.png`, `tray-icon-32.png`, `tray-icon-template.png`)

3. Regenerate formats from source:
   ```bash
   npm run generate-icons
   ```

4. Remove the `scripts/create-placeholder-icon.js` script (or keep for emergencies; renamed to `scripts/generate-source-icon.js`).

### 15.2 Update Settings > About page

Current state: the "Check for Updates" button shows a placeholder notice.

Update `src/renderer/src/components/settings/About.tsx` to:
- Show the app version from `app.getVersion()`
- Wire `checkForUpdates()` to show real status:
  - "Checking for updates..." (spinner)
  - "You're on the latest version" when `onUpdateNotAvailable` fires
  - "Version X.Y.Z is available" with "Download" button when `onUpdateAvailable` fires
  - Progress bar when `onUpdateDownloadProgress` fires
  - "Restart to install" button when `onUpdateDownloaded` fires
- Add metadata displayed:
  - App version, Electron version, Chrome version, Node version, V8 version
  - Database path, database size
  - Build timestamp (from CI)

### 15.3 Ensure test suite passes completely

**Current state:** Database tests fail due to `better-sqlite3` native module version mismatch.

Fix one of the following:
- Update test runner to use Electron's Node environment instead of system Node
- OR add a test setup script that rebuilds `better-sqlite3` for the test runner
- OR document that tests must be run with `npm run rebuild:test && npm test`

**Target:** All 224+ tests should pass in CI.

### 15.4 Add `.nvmrc` file

```
20.18.0
```

Document the project's required Node version. Ensure `better-sqlite3` rebuild works correctly with this version.

### 15.5 Update package.json `engines` field

```json
"engines": {
  "node": ">=20.0.0",
  "npm": ">=10.0.0"
}
```

### 15.6 Write proper README

The current README is minimal. Expand it to include:

- **Project title** + short description
- **Architecture diagram** (Proxy → Database → Dashboard)
- **Screenshots** of key views (Overview, Provider Drill-down, Settings)
- **Supported providers** table
- **Installation instructions** per platform:
  - Windows: download `.exe`, run installer
  - macOS: download `.dmg`, drag to Applications
  - Linux: download `.AppImage`, make executable
- **Development setup**:
  - Clone, `npm install`, `npm run dev`
  - Native module rebuild (`npm run postinstall`)
- **Building from source**:
  - `npm run build:win` / `:mac` / `:linux`
  - `npm run build:all`
- **Proxy configuration**:
  - How to route AI provider requests through the local proxy
  - API key storage security
- **Contributing** section
- **License**

### 15.7 Write release notes template

Create `.github/release_template.md` for consistent future releases:

```markdown
## What's New

### Features
- Feature description here

### Bug Fixes
- Bug fix description here

### Provider Updates
- Added support for X
- Updated pricing for Y

## Installation

| Platform | Download |
|----------|----------|
| Windows (64-bit) | `ai-usage-tracker-${VERSION}-setup.exe` |
| macOS (Intel) | `AI-Usage-Tracker-${VERSION}.dmg` |
| macOS (Apple Silicon) | `AI-Usage-Tracker-${VERSION}.dmg` |
| Linux (AppImage) | `ai-usage-tracker-${VERSION}.AppImage` |
| Linux (Debian) | `ai-usage-tracker_${VERSION}_amd64.deb` |
```

### 15.8 Add CHANGELOG.md

Record all changes from v1.0.0:

```markdown
# Changelog

## [1.0.0] — Initial Release

### Features
- Proxy server core (Task 2)
- Provider implementations — OpenAI, Anthropic, Ollama, GLM, MiniMax, Google Gemini, Mistral, Groq (Task 3)
- SQLite database with daily/weekly summaries and usage logs (Task 4)
- Token extraction and cost engine (Task 5)
- Dashboard UI with overview, provider drill-down, charts, cost tracking (Tasks 6-9)
- Settings and configuration UI (Task 10)
- System tray with background operation (Task 11)
- Data export and management (Task 12)
- Packaging, auto-updater, and CI/CD pipeline (Task 13)
```

### 15.9 Accessibility and UI polish pass

- Review all components for keyboard navigation (Tab order, Enter/Space on buttons)
- Add `aria-label` attributes where missing
- Verify color contrast meets WCAG AA
- Test responsive layout at 1024x768 minimum
- Ensure all toast / notification messages are dismissible

### 15.10 Final security review

- [ ] API keys are encrypted with `safeStorage` and never exposed in renderer
- [ ] Proxy does not log full request/response bodies (only headers + token counts)
- [ ] Database is in user-data directory, not the app bundle
- [ ] No hardcoded secrets, API keys, or credentials in source
- [ ] `nodeIntegration: false`, `contextIsolation: true` in preload
- [ ] CSP headers are configured appropriately

### 15.11 Performance sanity check

- [ ] App startup time < 3 seconds on all platforms
- [ ] Database queries return within 100ms for 10K+ usage logs
- [ ] Charts render within 200ms with 30 days of data
- [ ] No memory leaks in tray refresh timer or proxy event listeners
- [ ] Background CPU usage < 5% when idle

### 15.12 Update `T13-Done.md` to "All Tasks Complete"

Add a note at the top referencing that Tasks 14 and 15 represent the final QA, release, and polish phase.

## Verification
- [ ] All icons are professionally designed and visible in installers
- [ ] README.md is complete and accurate
- [ ] CHANGELOG.md records all v1.0.0 changes
- [ ] All tests pass (including database tests after rebuild fix)
- [ ] Accessibility review complete with no critical issues
- [ ] Security checklist verified
- [ ] Performance benchmarks met
- [ ] About page shows correct metadata and real updater status

## Dependencies
- Task 14 (Build verification and first release completed)
- Designer or design tool for icon creation (optional for MVP)

## After AI Completion: Human Checklist

After the AI agent reports Task 15 done, the following items **must** be verified by a human before the app is considered production-ready:

### Must verify manually (no AI substitute)
- [ ] **Icons pass the squint test** — Do they still look good at 16x16 in the taskbar? Are they recognizable? AI-generated or programmatic icons are functional but may lack polish. If they look amateur, source a designer.
- [ ] **README screenshots** — AI can write the README but cannot produce real screenshots of the running app. Take actual screenshots of Overview, Provider Drill-down, Settings, and add them to the README.
- [ ] **Changelog entry feels right** — AI can list features, but the tone, emphasis, and "story" of the release need human authorship. Read it and edit.
- [ ] **Security checklist** — Run through `src/main/security/encryption.ts`, `src/main/ipc/handlers.ts`, and proxy code yourself. Verify no API keys leak into logs or renderer. AI did a code review; human does a paranoia check.
- [ ] **Accessibility on a real screen reader** — AI can add `aria-labels`, but only a human with NVDA/VoiceOver/screen reader can tell if the navigation order is actually usable.

### Should review after AI reports done
- [ ] **README accuracy** — Run `npm run dev` and `npm run build:win` yourself. Do the instructions actually work? AI wrote them from existing codebase but may miss a step.
- [ ] **Build:mac and build:linux** — Did Task 14 actually verify these? If not, they are still TODO regardless of this task.
- [ ] **Performance feel** — Does the app feel fast when you use it? Open 30 days of data. Switch periods. Scroll usage logs. AI measured query times; human measures "> 3 seconds" frustration.

### Known limitations AI cannot overcome
- **App icon quality is capped at "functional code-generated"** — A real designer with vector tools (Illustrator, Figma) will produce better results. AI icons are acceptable for beta, not for a polished consumer product.
- **Screenshots must be real** — AI cannot take screenshots of an Electron app. You must run it and use Snipping Tool / macOS Screenshot / Linux equivalent.
- **Subjective feel** — Only a human can say "this feels right" vs. "this feels cheap." The AI implemented the spec; you decide if the spec actually matches your vision.

## Estimated Time
4-6 hours (2-3h for icons, 2-3h for documentation and polish)
