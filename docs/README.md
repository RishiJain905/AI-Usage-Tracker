# AI Usage Tracker — Implementation Tasks

## Overview

AI Usage Tracker is a desktop app (Electron + React) that runs a local proxy to intercept AI API calls, extract token usage, and display it in a beautiful dashboard. It supports all major AI providers — both cloud and local.

**Architecture:**
```
Client App → Local Proxy (:8765) → Provider API
                   ↓
            Extract tokens + calculate cost
                   ↓
            Store in SQLite → Display in React Dashboard
```

**Tech Stack:**
- **Shell:** Electron
- **Frontend:** Vite + React + TypeScript + shadcn/ui + Tailwind
- **Charts:** Recharts
- **State:** Zustand
- **Database:** SQLite (better-sqlite3)
- **Proxy:** Node.js http module
- **Build:** electron-builder + electron-vite

## Core Tracking Principles

These two requirements are baked into every task and every layer of the application:

### 1. Per-Model + Aggregate Dual Tracking
Users use **multiple models throughout the day** (e.g., GPT-4o for code, Claude for writing, Ollama for quick tasks). Every feature must support **both views simultaneously**:

- **Per-model tracking**: Each model's tokens, cost, and requests are tracked separately. Users can drill into any individual model to see its history, trends, and costs.
- **Aggregate total**: The "Total Tokens" shown everywhere is the **sum across ALL models**. This is the first number users see — the grand total of all AI usage regardless of which model produced it.

**How it's implemented:**
- Database: `daily_summary` and `weekly_summary` tables are keyed by `(date, provider_id, model_id)` — enabling both per-model queries and aggregate `SUM()` across all models
- Repository: `getAggregateTotal(period)` returns the grand total; `getAllModelSummaries(period)` returns per-model breakdown
- UI: Every view has both an aggregate metric card (all models total) and a per-model breakdown section

### 2. Daily / Weekly / All-Time Period Tracking
Every metric, chart, and table must respect the global **period selector**:

- **Today**: Usage since midnight (local time)
- **This Week**: Usage since Monday of the current week
- **This Month**: Usage since the 1st of the current month
- **All Time**: Usage since the first recorded event

**How it's implemented:**
- Database: `daily_summary` (per-model-per-day) and `weekly_summary` (per-model-per-week) tables provide fast period queries
- Repository: Every query method accepts `period: 'today' | 'week' | 'month' | 'all'`
- UI: Global period selector in the header; changing it instantly re-queries all data (aggregate + per-model)

---

## Task List

| # | Task | Depends On | Est. Time |
|---|------|-----------|-----------|
| 01 | [Project Scaffolding](task-01-project-scaffolding.md) | — | 2-3h |
| 02 | [Proxy Server Core](task-02-proxy-server-core.md) | 01 | 4-5h |
| 03 | [Provider Implementations](task-03-provider-implementations.md) | 02 | 5-6h |
| 04 | [SQLite Schema & Data Layer](task-04-sqlite-schema-data-layer.md) | 02, 03 | 3-4h |
| 05 | [Token Extraction & Cost Engine](task-05-token-extraction-cost-engine.md) | 03, 04 | 3-4h |
| 06 | [Dashboard UI Foundation](task-06-dashboard-ui-foundation.md) | 01 | 4-5h |
| 07 | [Overview & Summary Dashboard](task-07-overview-summary-dashboard.md) | 04, 05, 06 | 4-5h |
| 08 | [Provider & Model Drill-Down](task-08-provider-model-drill-down.md) | 06, 07 | 4-5h |
| 09 | [Charts & Cost Tracking Views](task-09-charts-cost-tracking.md) | 07, 08 | 5-6h |
| 10 | [Settings & Configuration UI](task-10-settings-configuration.md) | 04, 06 | 4-5h |
| 11 | [System Tray & Background Operation](task-11-system-tray-background.md) | 02, 06 | 2-3h |
| 12 | [Data Export & Management](task-12-data-export-management.md) | 04, 09, 10 | 3-4h |
| 13 | [Packaging, Build & Distribution](task-13-packaging-build-distribution.md) | All | 3-4h |
| 14 | [Build Verification, E2E Test & First Release](task-14-build-e2e-release.md) | 13 | 3-4h |
| 15 | [Quality Assurance, Documentation & Final Polish](task-15-polish-documentation.md) | 14 | 4-6h |

**Total Estimated Time: ~54-70 hours**

### Deployment Readiness

| Phase | Tasks | Status |
|-------|-------|--------|
| Feature Development | 01-13 | Done |
| Build & Release | 14 | Ready for execution |
| Final Polish & QA | 15 | Ready for execution |

After Task 15, the app is **production-ready** for official deployment.

---

## Dependency Graph

```
Task 1 (Scaffolding)
 ├── Task 2 (Proxy Core)
 │    ├── Task 3 (Providers)
 │    │    ├── Task 4 (SQLite)
 │    │    │    ├── Task 5 (Tokens/Cost)
 │    │    │    │    └── Task 7 (Overview Dashboard)
 │    │    │    │         ├── Task 8 (Drill-Down)
 │    │    │    │         │    └── Task 9 (Charts/Cost)
 │    │    │    │         │         └── Task 12 (Export)
 │    │    │    │         └── Task 10 (Settings) ──→ Task 12
 │    │    │    └── Task 10 (Settings)
 │    │    └── Task 5 (Tokens/Cost)
 │    └── Task 4 (SQLite)
 └── Task 6 (UI Foundation)
      ├── Task 7 (Overview Dashboard)
      ├── Task 8 (Drill-Down)
      ├── Task 9 (Charts/Cost)
      ├── Task 10 (Settings)
      └── Task 11 (System Tray)

Task 13 (Packaging) → depends on all
```

## Parallelization Opportunities

Tasks that can be worked on simultaneously:

| Phase | Tasks | Notes |
|-------|-------|-------|
| Phase 1 | 01 | Scaffolding must go first |
| Phase 2 | 02, 06 | Proxy + UI can be built in parallel |
| Phase 3 | 03 | Provider implementations (after proxy core) |
| Phase 4 | 04 | Database layer (after providers) |
| Phase 5 | 05, 11 | Token engine + System tray (independent of each other) |
| Phase 6 | 07, 10 | Dashboard + Settings (independent) |
| Phase 7 | 08 | Drill-down views (after overview) |
| Phase 8 | 09, 12 | Charts/Cost + Export (partially independent) |
| Phase 9 | 13 | Final packaging (after everything) |

---

## Supported Providers

| Provider | Type | Auth | Token Format |
|----------|------|------|-------------|
| OpenAI | Cloud | Bearer token | `usage.prompt_tokens / completion_tokens` |
| Anthropic | Cloud | x-api-key | `usage.input_tokens / output_tokens` |
| Ollama | Local / Cloud | None (local) or Bearer token (cloud) | Local: `prompt_eval_count`/`eval_count`; Cloud (`https://ollama.com/v1`): OpenAI-compatible `usage.*` |
| GLM (ZhipuAI) | Cloud | Bearer (JWT) | OpenAI-compatible |
| MiniMax | Cloud | Bearer token | OpenAI-compatible |
| Google Gemini | Cloud | URL param key | `usageMetadata.*TokenCount` |
| Mistral | Cloud | Bearer token | OpenAI-compatible |
| Groq | Cloud | Bearer token | OpenAI-compatible + cached tokens |

Custom providers can be added via the settings UI with configurable response format.
