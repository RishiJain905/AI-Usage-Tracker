# Task 4: SQLite Schema & Data Layer — Completion Summary

## Status: COMPLETE

## Files Created

| File | Description |
|------|-------------|
| `src/main/database/types.ts` | TypeScript interfaces for all 7 database tables (Provider, Model, UsageLog, DailySummary, WeeklySummary, SettingsRecord, ApiKey), plus query input types (InsertUsageLogInput, UpsertSummaryInput, UsageFilters), result types (AggregateTotal, ModelBreakdown, ModelUsage, DailyTrend, WeeklyTrend, ProviderSummary, UsageSummary), seed data types (SeedProvider, SeedModel), and the Period union type |
| `src/main/database/init.ts` | Database initialization: opens `ai-tracker.db` in `app.getPath('userData')`, enables WAL mode and foreign keys, creates `migrations` tracking table, runs pending migrations, and seeds reference data |
| `src/main/database/migrations/001-initial-schema.ts` | V1 migration with all 7 tables and 11 indexes — `providers`, `models`, `usage_logs`, `daily_summary`, `weekly_summary`, `settings`, `api_keys` with full up/down support |
| `src/main/database/migrations/index.ts` | Migration runner: `Migration` interface, `runMigrations()` that applies pending migrations in version order within individual transactions, `getAppliedVersions()` helper |
| `src/main/database/seed.ts` | 8 providers (OpenAI, Anthropic, Ollama, GLM, MiniMax, Gemini, Mistral, Groq) and 31 models with pricing data, all inserted via `INSERT OR IGNORE` for idempotency |
| `src/main/database/repository.ts` | Full `UsageRepository` class with 26 methods, 30 prepared statements, period-aware queries (`today`/`week`/`month`/`all`), aggregate totals across all models, per-model breakdowns, daily/weekly trends, settings, and cleanup |
| `src/main/database/index.ts` | Barrel export for the database module |
| `vitest.config.ts` | Vitest test configuration (node environment, `src/**/*.test.ts` glob) |
| `src/main/database/init.test.ts` | 9 tests for `initDatabase()` and `closeDatabase()` |
| `src/main/database/migrations.test.ts` | 12 tests for V1 migration up/down, idempotency, index creation |
| `src/main/database/seed.test.ts` | 11 tests for seed data insertion and idempotency |
| `src/main/database/repository.test.ts` | 56 tests for all `UsageRepository` methods |

## Files Modified

| File | Changes |
|------|---------|
| `src/main/index.ts` | Added database initialization (`initDatabase` + `UsageRepository`), wired proxy `request-completed` events to write usage logs and upsert daily/weekly summaries with inline cost calculation from model pricing, subscribed to `request-error` events, added `closeDatabase(db)` on `window-all-closed`, passed `repository` to `registerProxyIpcHandlers` |
| `src/main/ipc/handlers.ts` | Extended `registerProxyIpcHandlers` to accept `UsageRepository`, added 18 IPC handlers for all database query methods |
| `src/preload/index.ts` | Added 20 database IPC methods to the `api` object exposed to the renderer |
| `src/preload/index.d.ts` | Added full type declarations for all database types and DB IPC methods in the `ProxyAPI` interface |

## Key Design Decisions

1. **Inline cost calculation** (Task 5 placeholder): Cost is computed directly from the `models` table pricing at the time of the `request-completed` event. `inputCost = (promptTokens / 1_000_000) * input_price_per_million`. This will be refactored into a dedicated cost engine in Task 5.

2. **Additive upsert pattern**: Daily and weekly summaries use a check-then-insert-or-update pattern rather than `INSERT OR REPLACE` to correctly accumulate running totals (request_count, tokens, costs) rather than overwriting them.

3. **Prepared statements**: All 30 database queries are prepared once in the `UsageRepository` constructor for optimal query performance.

4. **Period-aware queries**: Every query method accepts `Period = 'today' | 'week' | 'month' | 'all'` and uses `date-fns` to compute date ranges, querying from `daily_summary` for daily/monthly/all-time and `weekly_summary` for weekly views.

5. **Dual model tracking**: Both per-model and aggregate totals are supported through the `(date, provider_id, model_id)` composite key in summary tables and `SUM()` aggregate queries.

## Test Suite

Vitest was set up and comprehensive unit tests were written for the database layer.

### Test Infrastructure
- `vitest.config.ts` — Vitest configuration (node environment, `src/**/*.test.ts` glob)
- `package.json` — Added `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- Dev dependency: `vitest@4.1.4`

### Test Files (88 tests, all passing)

| File | Tests | Coverage |
|------|-------|----------|
| `src/main/database/init.test.ts` | 9 | `initDatabase()` file creation, WAL mode, foreign keys, table creation, seeding, idempotency; `closeDatabase()` |
| `src/main/database/migrations.test.ts` | 12 | V1 `up()` creates all 7 tables + 11 indexes with correct columns/constraints, `down()` drops all tables, `runMigrations` idempotency, `getAppliedVersions` |
| `src/main/database/seed.test.ts` | 11 | 8 providers + 30 models seeded, idempotency via `INSERT OR IGNORE`, spot-check data correctness (OpenAI, Anthropic, GPT-4o, Claude, local models), exported constants |
| `src/main/database/repository.test.ts` | 56 | `insertUsageLog` (defaults, error info), `upsertDailySummary`/`upsertWeeklySummary` (insert + upsert + weighted avg), `getUsageLogs` (filters/limit/offset), `getUsageSummary` (all periods), aggregate totals (daily/weekly/all-time), `getModelBreakdownForPeriod`, `getAllModelSummaries`, `getTopModels`, trend queries, provider/model aggregations, settings CRUD, `deleteUsageBefore`, `vacuum` |

### Bug Fix Applied During Testing
The test-automator found and fixed a runtime bug in `repository.ts`: the `private readonly stmts!: {...}` declaration used TypeScript's definite assignment assertion (`!`) which caused a `TypeError: Cannot set properties of undefined` at runtime when `useDefineForClassFields: true` (the default in modern TypeScript). Changed to `private readonly stmts: {...}` with inline initialization in the constructor, which works correctly.

## Verification

- [x] `npm run typecheck:node` — PASSED (zero errors)
- [x] `npm run typecheck:web` — PASSED (zero errors)
- [x] `npm run lint` — PASSED (2 pre-existing errors in renderer button.tsx, no new errors from this task)
- [x] `npx vitest run` — **88/88 tests PASSED**
- [x] Prettier formatting issues in new files — FIXED

## Spec Deviations

- None. All 6 steps (4.1–4.6) from the spec have been fully implemented.

## Reminders for Subsequent Tasks

- **Task 5** (Token Extraction & Cost Engine): Refactor the inline cost calculation in `index.ts` into `src/main/cost/calculator.ts` and `src/main/cost/pricing.ts`. The current inline calculation queries the `models` table directly — this should be replaced with a proper cost calculator module.
- **Task 6** (Dashboard UI Foundation): The renderer now has access to all DB query methods via `window.api.db*()` IPC calls. The type declarations are in `src/preload/index.d.ts`.
- **Task 11** (System Tray): The `closeDatabase(db)` call is already wired in the `window-all-closed` handler.
