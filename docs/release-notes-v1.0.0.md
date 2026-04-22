# AI Usage Tracker v1.0.0 — Release Notes

**Release Date:** 2026-04-21
**Tag:** v1.0.0

---

## What's New

### Task 1: Project Scaffolding
Laid the complete foundation for AI Usage Tracker using Electron + Vite + React + TypeScript. Configured Tailwind CSS, shadcn/ui component library, React Router, and TypeScript path aliases (`@/*`, `@main/*`, `@preload/*`, `@renderer/*`). Established the full directory structure for main process, preload, and renderer code.

### Task 2: Proxy Server Core
Built the local proxy server that intercepts AI provider API requests at `127.0.0.1:8765`. The proxy forwards requests to the correct provider endpoints, captures token usage from responses, and handles streaming (SSE) responses in real time. Includes request/response logging hooks, health check endpoint (`GET /health`), header sanitization for secure logging, and graceful error handling with appropriate HTTP status codes (502, 504, 401, 403, 429).

### Task 3: Provider Implementations
Implemented provider-specific token extraction for all major AI APIs. Each provider has dedicated parsing logic for both standard and streaming response formats:
- **OpenAI** — chat, completions, embeddings, and DALL-E image detection
- **Anthropic** — message_start + message_delta streaming extraction
- **Ollama** — dual-mode: local (`prompt_eval_count/eval_count`) and cloud (OpenAI-compatible)
- **GLM / ZhipuAI** — OpenAI-compatible with JWT Bearer auth
- **MiniMax** — OpenAI-compatible streaming
- **Google Gemini** — `usageMetadata.*TokenCount` with regex path matching
- **Mistral** — OpenAI-compatible extraction
- **Groq** — OpenAI-compatible with `cached_tokens` support
- **Unknown fallback** — tries all three formats (OpenAI, Anthropic, Gemini) for unsupported providers

### Task 4: SQLite Schema & Data Layer
Designed and implemented a complete SQLite schema with 7 tables (`providers`, `models`, `usage_logs`, `daily_summary`, `weekly_summary`, `settings`, `api_keys`) and 11 indexes. Built a `UsageRepository` class with 30 prepared statements supporting period-aware queries (`today`, `week`, `month`, `all`), aggregate totals, per-model breakdowns, daily/weekly trends, and settings CRUD. Includes comprehensive Vitest test suite (88 tests) and database migrations with WAL mode and foreign key enforcement.

### Task 5: Token Extraction & Cost Engine
Centralized token extraction with fallback estimation when providers don't return usage data. Implemented a `CostCalculator` with support for per-request cost, batch aggregation, and cache discounts. Pricing data is seeded from a built-in catalog with override support via settings. DALL-E image requests are tracked with fixed per-image pricing. All usage metadata (estimation flags, cache counters, modality counters, pricing source) is persisted to the database.

### Task 6: Dashboard UI Foundation
Built the complete dashboard shell with a collapsible sidebar, top header with global period selector and proxy status, dark/light theme toggle, and React Router navigation. Installed 20 shadcn/ui components. Implemented Zustand stores (`usageStore`, `settingsStore`) with real-time IPC event subscriptions, persistent theme management, and loading/state components (spinner, empty state, error state, proxy-off state).

### Task 7: Overview & Summary Dashboard
Composed the main Overview page with aggregate metric cards, per-model breakdown bars, usage timeline charts (AreaChart with toggle between Aggregate and Per-Model Stacked modes), provider distribution donut chart, and live-updating recent activity log. All metrics respect the global period selector and support both aggregate totals and per-model drill-downs.

### Task 8: Provider & Model Drill-Down
Implemented dedicated "By Provider" and "By Model" views with interactive provider cards, inline detail panels, model ranking charts (horizontal bar, color-coded by provider), model comparison tables (sortable, filterable, paginated), and multi-line trend timelines. Detail modals show model share-of-total usage with mini area charts.

### Task 9: Charts & Cost Tracking Views
Built dedicated cost tracking with stacked area cost timelines (input/output layers), provider donut chart for cost distribution, model cost ranking, budget tracker with progress bar and color thresholds, 7-day cost projection, and a sortable daily cost table. Added a full searchable/filterable Usage History page with expandable rows, provider/model/status filters, and pagination.

### Task 10: Settings & Configuration
Comprehensive settings UI covering proxy configuration (port, inject vs passthrough auth), display preferences (currency, number formatting), budget controls (monthly budget), data retention policies, API key management with encrypted storage using Electron `safeStorage`, custom pricing overrides, custom provider setup, and app information with full auto-updater state machine UI.

### Task 11: System Tray & Background Operation
Full system tray integration with close-to-tray behavior, dynamic context menu showing live proxy status and usage stats, and global keyboard shortcuts (`Ctrl/Cmd+Shift+A` toggle window, `Ctrl/Cmd+Shift+P` toggle proxy). Includes single-instance lock, auto-launch support, and native OS notifications for proxy events, provider errors, and budget alerts.

### Task 12: Data Export & Management
Export capabilities in CSV (13 columns, TOTAL row, groupByModel subtotals), JSON (with aggregate summary and per-model breakdown), and self-contained HTML report formats. Database backup/restore with rotation (keep last 5). Scheduled data retention cleanup. Chart image export (SVG/PNG). ZhipuAI catch-up sync with deduplication.

### Task 13: Packaging, Build & Distribution
Complete cross-platform packaging configured via `electron-builder.yml` with Windows NSIS installer, macOS DMG, and Linux AppImage + .deb targets. Application icons generated for all platforms plus tray variants. Auto-updater integration with `electron-updater` publishing to GitHub Releases. CI/CD pipeline via GitHub Actions for matrix builds across Windows, macOS, and Linux. macOS code signing and notarization support (CSC_LINK-gated).

---

## Supported Providers

| Provider | Type | Authentication | Notes |
|----------|------|-------------|-------|
| **OpenAI** | Cloud | Bearer token | GPT-4o, GPT-4, GPT-3.5, DALL-E image pricing |
| **Anthropic** | Cloud | x-api-key | Claude 3.5/3 family, streaming message_delta extraction |
| **Ollama** | Local / Cloud | None (local) / Bearer (cloud) | Local mode via `prompt_eval_count/eval_count`; cloud mode via OpenAI-compatible endpoint |
| **GLM / ZhipuAI** | Cloud | Bearer (JWT) | OpenAI-compatible with ZhipuAI monitoring API sync support |
| **MiniMax** | Cloud | Bearer token | OpenAI-compatible format |
| **Google Gemini** | Cloud | URL parameter key | `usageMetadata.*TokenCount`, regex path matching |
| **Mistral** | Cloud | Bearer token | OpenAI-compatible format |
| **Groq** | Cloud | Bearer token | OpenAI-compatible + `cached_tokens` tracking |
| **Custom** | Cloud / Local | Configurable | Add any provider via Settings with custom response parsing rules |

---

## Installation Instructions

### Windows
1. Download `AI-Usage-Tracker-Setup-<version>.exe` from the release assets.
2. Run the installer. It will install the app and create a Start Menu shortcut.
3. Launch **AI Usage Tracker** from the Start Menu or desktop shortcut.

### macOS
1. Download `AI-Usage-Tracker-<version>.dmg` from the release assets.
2. Open the DMG and drag **AI Usage Tracker** into your Applications folder.
3. Launch from Applications. If you see a Gatekeeper warning, see **Known Issues** below.

### Linux
Two distribution formats are provided:
- **AppImage** (universal): Download `AI-Usage-Tracker-<version>.AppImage`, make it executable (`chmod +x`), and run it directly.
- **Debian package**: Download `ai-usage-tracker_<version>_amd64.deb` and install with `sudo dpkg -i ai-usage-tracker_<version>_amd64.deb`.

---

## Known Issues

- **macOS Gatekeeper Warning** — macOS builds in this release are **unsigned**. Opening the app will show a security warning. To run, right-click the app in Applications and select **Open**, or go to **System Settings → Privacy & Security** and allow it. If you require a signed build, please open an issue.
- **Auto-updater Requires Release** — The in-app auto-updater checks GitHub Releases for updates. It requires a release to exist on GitHub before it can detect or download updates. The first check may report "no updates" until the release is published.
- **Native Module Rebuild on Install** — When installing dependencies locally, `better-sqlite3` must be rebuilt for Electron's ABI. Run `npx electron-builder install-app-deps` after `npm install` if building locally.

---

## Architecture

AI Usage Tracker is built as a desktop Electron application with the following architecture:

```
┌─────────────────────────────────────────┐
│         Electron Main Process           │
│  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │ Proxy   │  │ SQLite  │  │ Auto   │ │
│  │ Server  │  │ DB      │  │ Updater│ │
│  │ :8765   │  │ (WAL)   │  │        │ │
│  └────┬────┘  └────┬────┘  └────────┘ │
│       │            │                    │
│  ┌────┴────────────┴────┐               │
│  │   IPC Bridge         │               │
│  └──────────┬─────────────┘               │
└─────────────┼───────────────────────────┘
              │
┌─────────────┼───────────────────────────┐
│         Electron Renderer               │
│    (Vite + React + TypeScript)         │
│  ┌─────────┐  ┌─────────┐  ┌────────┐  │
│  │Dashboard│  │ Charts  │  │Settings│  │
│  │ (Zustand│  │(Recharts)│  │  UI    │  │
│  │ stores) │  │         │  │        │  │
│  └─────────┘  └─────────┘  └────────┘  │
└─────────────────────────────────────────┘
```

**Data Flow:**
1. Your AI client app sends API requests through the local proxy (`127.0.0.1:8765`).
2. The proxy forwards the request to the actual provider and captures the response.
3. Token usage is extracted from the response and passed to the Cost Engine.
4. Usage data is written to SQLite with per-model and aggregate summaries.
5. The React Dashboard queries the database via IPC and displays real-time usage stats.

**Tech Stack:**
- **Shell:** Electron
- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **State:** Zustand
- **Database:** SQLite (better-sqlite3) with WAL mode and migrations
- **Proxy:** Node.js `http`/`https` modules
- **Build:** electron-builder + electron-vite

---

## Minimum Requirements

- **Windows:** Windows 10 (64-bit) or later
- **macOS:** macOS 11 (Big Sur) or later (Intel & Apple Silicon)
- **Linux:** Ubuntu 20.04 / Fedora 35 / Debian 11 or equivalent (64-bit)
- **Node.js >= 18** (for local development only; not required for end users)

---

## Feedback & Issues

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/terratch/ai-usage-tracker/issues).
