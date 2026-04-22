# Task 12: Data Export & Management — DONE

## Summary

All 10 sub-features for data export and management have been implemented, integrated, and verified.

## Files Created

### Backend Modules (Phase 1)
| File | Purpose |
|------|---------|
| `src/main/export/csv.ts` | CSV export with 13 columns, TOTAL row, groupByModel subtotals, CSV escaping |
| `src/main/export/csv.test.ts` | 11 unit tests for CSV export |
| `src/main/export/json.ts` | JSON export with optional aggregate summary and per-model breakdown |
| `src/main/export/json.test.ts` | 10 unit tests for JSON export |
| `src/main/export/report.ts` | Self-contained dark-theme HTML report with charts |
| `src/main/export/backup.ts` | Database backup via better-sqlite3 `.backup()`, rotation (keep last 5) |
| `src/main/export/restore.ts` | Backup validation, pre-restore backup, restart-needed flag |
| `src/main/database/cleanup.ts` | Data retention cleanup (never touches daily/weekly summaries) |
| `src/main/database/cleanup.test.ts` | 14 unit tests for cleanup |
| `src/main/sync/zhipuai-sync.ts` | ZhipuAI catch-up sync with dedup, source:'sync' marking, summary recalculation |
| `src/main/sync/zhipuai-sync.test.ts` | 12 unit tests for ZhipuAI sync |
| `src/main/database/migrations/003-task-12-source-index.ts` | Index on `usage_logs(source)` for sync dedup queries |

### Frontend UI (Phase 3)
| File | Purpose |
|------|---------|
| `src/renderer/src/components/settings/DataManagement.tsx` | New settings page: backup, restore, cleanup, export all, ZhipuAI sync |
| `src/renderer/src/lib/chart-export.ts` | Chart SVG/PNG export utility for Recharts |

## Files Modified

### Integration Layer (Phase 2)
| File | Changes |
|------|---------|
| `src/main/ipc/handlers.ts` | Added 10 new IPC channels: export:csv, export:json, export:html-report, export:save-file, export:chart-image, data:backup, data:restore, data:cleanup, sync:zhipuai, sync:zhipuai-status |
| `src/preload/index.ts` | Exposed all new IPC methods on `window.api` |
| `src/preload/index.d.ts` | Added type definitions for all new API methods |
| `src/main/database/init.ts` | Added `getDatabase()` export, cleanup scheduling on startup |
| `src/main/database/index.ts` | Re-exported `getDatabase` |
| `src/main/database/migrations/index.ts` | Added migration003 |
| `src/main/index.ts` | Cleanup scheduling on startup + daily interval |

### Frontend UI
| File | Changes |
|------|---------|
| `src/renderer/src/components/dashboard/UsageHistory.tsx` | Added Export dropdown with CSV, JSON, Summary, HTML options; Group by Model and Total Row toggles |
| `src/renderer/src/components/settings/Settings.tsx` | Added "Data Management" nav item |
| `src/renderer/src/App.tsx` | Added `/settings/data` route |

### Test Updates
| File | Changes |
|------|---------|
| `src/main/database/migrations.test.ts` | Updated migration count from 2 to 3 |
| `src/main/database/init.test.ts` | Updated migration count from 2 to 3 |

## Verification Results

- **Typecheck**: `npm run typecheck` — passes (0 errors)
- **Tests**: `npm test` — 224 tests pass across 18 test files (0 failures)
- **Lint**: `npm run lint` — only pre-existing warnings; no new errors introduced

## Feature Coverage

| Task Step | Status |
|-----------|--------|
| 12.1 CSV export with TOTAL row + groupByModel | Done |
| 12.2 JSON export with aggregate + per-model summaries | Done |
| 12.3 Database backup with rotation | Done |
| 12.4 Database restore with validation | Done |
| 12.5 Export UI (History + Settings) | Done |
| 12.6 File save dialog | Done |
| 12.7 Scheduled cleanup | Done |
| 12.8 Chart image export (SVG/PNG) | Done |
| 12.9 Shareable HTML report | Done |
| 12.10 ZhipuAI catch-up sync with dedup | Done |
