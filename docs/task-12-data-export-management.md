# Task 12: Data Export & Management

## Objective
Add data export capabilities (CSV, JSON) and data management features (backup, restore, cleanup) so users can use their tracking data outside the app.

## Steps

### 12.1 Implement CSV export

File: `src/main/export/csv.ts`

Export usage logs to CSV format:

```typescript
interface CsvExportOptions {
  dateRange?: { start: string; end: string };
  period?: 'today' | 'week' | 'month' | 'all';
  providers?: string[];
  models?: string[];
  includeHeaders?: boolean;
  includeAggregateRow?: boolean;  // Add a TOTAL row summing all models at the end
  groupByModel?: boolean;         // Group rows by model with subtotals
}

function exportToCsv(repository: UsageRepository, options: CsvExportOptions): string {
  const logs = repository.getUsageLogs(options);
  const headers = ['Date', 'Time', 'Provider', 'Model', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens', 'Input Cost', 'Output Cost', 'Total Cost', 'Duration (ms)', 'Streaming', 'Endpoint'];

  const rows = logs.map(log => [
    log.requestedAt.split('T')[0],
    log.requestedAt.split('T')[1],
    log.providerId,
    log.modelId,
    log.promptTokens,
    log.completionTokens,
    log.totalTokens,
    log.inputCost.toFixed(6),
    log.outputCost.toFixed(6),
    log.totalCost.toFixed(6),
    log.requestDurationMs,
    log.isStreaming ? 'Yes' : 'No',
    log.endpoint,
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
```

### 12.2 Implement JSON export

File: `src/main/export/json.ts`

Export in structured JSON format:

```typescript
interface JsonExportOptions extends CsvExportOptions {
  includeSummary?: boolean;  // Include aggregated summary
  includePerModelSummary?: boolean;  // Include per-model breakdown in summary
  pretty?: boolean;          // Formatted JSON
}

function exportToJson(repository: UsageRepository, options: JsonExportOptions): string {
  const logs = repository.getUsageLogs(options);
  const export_ = {
    exportedAt: new Date().toISOString(),
    exportedBy: 'AI Usage Tracker v1.0.0',
    dateRange: options.dateRange,
    period: options.period,
    aggregateSummary: options.includeSummary ? repository.getAggregateTotal(options.period) : undefined,
    perModelSummary: options.includePerModelSummary ? repository.getAllModelSummaries(options.period) : undefined,
    logs: logs,
  };

  return JSON.stringify(export_, null, options.pretty ? 2 : 0);
}
```

### 12.3 Implement database backup

File: `src/main/export/backup.ts`

Full database backup using SQLite's backup API:

```typescript
import Database from 'better-sqlite3';

function backupDatabase(sourceDb: Database, backupPath: string): void {
  sourceDb.backup(backupPath)
    .then(() => { /* success */ })
    .catch((err) => { /* error */ });
}
```

Features:
- One-click backup to user-chosen location
- Default backup name: `ai-tracker-backup-YYYY-MM-DD.db`
- Show backup size and date in UI
- Keep last 5 backups (auto-rotate)

### 12.4 Implement database restore

File: `src/main/export/restore.ts`

Restore from a backup file:
- Show file picker for .db files
- Validate backup before restoring (check schema version)
- Create a pre-restore backup automatically
- Replace current database with backup
- Restart proxy server after restore
- Confirm dialog before executing

### 12.5 Build export UI

Add export functionality to the settings and history pages:

**In Usage History page:**
- "Export" button with dropdown:
  - Export as CSV (with optional aggregate total row)
  - Export as JSON (with per-model breakdown)
  - Export summary only (aggregate + per-model breakdown, no individual logs)
- Apply current filters to export (date range, period, provider, model)
- **"Group by Model" toggle** — groups CSV rows by model with subtotal rows
- Show export progress indicator
- Auto-open file location after export

**In Settings page:**
- "Data Management" section:
  - Database size and date range
  - Backup button → creates backup, shows location
  - Restore button → file picker, confirmation
  - "Export all data" → full CSV/JSON export

### 12.6 Implement file save dialog

Use Electron's `dialog.showSaveDialog()` for exports:

```typescript
import { dialog } from 'electron';

async function saveExport(content: string, defaultName: string, format: 'csv' | 'json') {
  const result = await dialog.showSaveDialog({
    title: 'Export Usage Data',
    defaultPath: defaultName,
    filters: [
      { name: format.toUpperCase(), extensions: [format] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return result.filePath;
  }
  return null;
}
```

### 12.7 Implement scheduled cleanup

File: `src/main/database/cleanup.ts`

Automatic data cleanup based on retention settings:

```typescript
function runCleanup(repository: UsageRepository, retentionDays: number): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const deleted = repository.deleteUsageBefore(cutoffDate.toISOString());
  repository.vacuum(); // Reclaim space

  return deleted;
}
```

- Run on app startup (if auto-cleanup is enabled)
- Run daily as a scheduled task
- Log cleanup events (how many records removed, space reclaimed)
- Never delete daily_summary (always keep aggregated data)

### 12.8 Add chart image export

Allow users to export individual charts as PNG/SVG:
- Right-click on any chart → "Save as Image"
- Use Recharts' built-in `toSVG()` or html2canvas
- Save as PNG (default) or SVG (vector)

### 12.9 Build shareable report

File: `src/main/export/report.ts`

Generate a standalone HTML report that can be shared:

```typescript
function generateHtmlReport(repository: UsageRepository, options: ExportOptions): string {
  // Generate self-contained HTML with embedded charts (Chart.js from CDN)
  // Includes summary, charts, and tables
  // Looks good when opened in any browser
  // Can be printed to PDF
}
```

Features:
- Self-contained HTML file (no external dependencies except Chart.js CDN)
- Includes all charts and summary tables
- **Includes per-model breakdown table** showing each model's tokens, cost, requests
- **Includes aggregate total row** at top
- Matches the app's theme (dark mode)
- Can be opened in any browser
- Can be printed to PDF from the browser

## Verification
- CSV export contains all columns with correct data
- **CSV export includes optional aggregate TOTAL row** (summing all models)
- **CSV export supports "Group by Model" mode** with subtotals per model
- JSON export is valid and includes **both aggregate and per-model summaries** if requested
- File save dialog works on all platforms
- Database backup creates valid backup file
- Database restore replaces current data correctly
- Cleanup removes records older than retention period
- Chart image export produces readable PNG/SVG
- HTML report is self-contained and renders correctly in browsers
- Export respects current filters (provider, date range, etc.)

## Dependencies
- Task 4 (SQLite Schema & Data Layer)
- Task 9 (Charts & Cost Tracking Views)
- Task 10 (Settings & Configuration UI)

## Estimated Time
3-4 hours
