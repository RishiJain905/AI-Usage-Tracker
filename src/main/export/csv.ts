/**
 * CSV Export — convert usage logs to CSV format with optional grouping and totals.
 */

import type { Period, UsageFilters, UsageLog } from "../database/types";
import { UsageRepository, getPeriodDates } from "../database/repository";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CsvExportOptions {
  dateRange?: { start: string; end: string };
  period?: Period;
  providers?: string[];
  models?: string[];
  includeHeaders?: boolean;
  includeAggregateRow?: boolean;
  groupByModel?: boolean;
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline. */
function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Format a single UsageLog row into 13 CSV columns. */
function formatRow(log: UsageLog): string {
  const requestedAt = new Date(log.requested_at);
  const date = requestedAt.toISOString().slice(0, 10);
  const time = requestedAt.toISOString().slice(11, 19);

  const cols = [
    date,
    time,
    log.provider_id,
    log.model_id,
    log.prompt_tokens.toString(),
    log.completion_tokens.toString(),
    log.total_tokens.toString(),
    log.input_cost.toString(),
    log.output_cost.toString(),
    log.total_cost.toString(),
    (log.request_duration_ms ?? 0).toString(),
    log.is_streaming ? "true" : "false",
    (log.endpoint ?? "").toString(),
  ];

  return cols.map(escapeCsv).join(",");
}

/** Column headers for the CSV. */
const HEADERS = [
  "Date",
  "Time",
  "Provider",
  "Model",
  "Prompt Tokens",
  "Completion Tokens",
  "Total Tokens",
  "Input Cost",
  "Output Cost",
  "Total Cost",
  "Duration (ms)",
  "Streaming",
  "Endpoint",
];

// ---------------------------------------------------------------------------
// Numeric field extraction for totals
// ---------------------------------------------------------------------------

interface NumericRow {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_duration_ms: number;
}

function sumNumericFields(logs: UsageLog[]): NumericRow {
  return logs.reduce(
    (acc, log) => ({
      prompt_tokens: acc.prompt_tokens + log.prompt_tokens,
      completion_tokens: acc.completion_tokens + log.completion_tokens,
      total_tokens: acc.total_tokens + log.total_tokens,
      input_cost: acc.input_cost + log.input_cost,
      output_cost: acc.output_cost + log.output_cost,
      total_cost: acc.total_cost + log.total_cost,
      request_duration_ms:
        acc.request_duration_ms + (log.request_duration_ms ?? 0),
    }),
    {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      input_cost: 0,
      output_cost: 0,
      total_cost: 0,
      request_duration_ms: 0,
    },
  );
}

function formatTotalRow(label: string, totals: NumericRow): string {
  const cols = [
    label,
    "",
    "",
    "",
    totals.prompt_tokens.toString(),
    totals.completion_tokens.toString(),
    totals.total_tokens.toString(),
    totals.input_cost.toString(),
    totals.output_cost.toString(),
    totals.total_cost.toString(),
    totals.request_duration_ms.toString(),
    "",
    "",
  ];
  return cols.map(escapeCsv).join(",");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function exportToCsv(
  repository: UsageRepository,
  options: CsvExportOptions,
): string {
  const {
    dateRange,
    period,
    providers,
    models,
    includeHeaders = true,
    includeAggregateRow = false,
    groupByModel = false,
  } = options;

  // Determine date range
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (dateRange) {
    startDate = dateRange.start;
    endDate = dateRange.end;
  } else if (period) {
    const dates = getPeriodDates(period);
    startDate = dates.start;
    endDate = dates.end;
  }

  // Build filters and fetch logs in one pass.
  const filters: UsageFilters = {
    startDate,
    endDate,
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
  };

  if (providers && providers.length > 0) {
    filters.providerIds = providers;
  }

  if (models && models.length > 0) {
    filters.modelIds = models;
  }

  const allLogs = repository.getUsageLogs(filters);

  // Sort by requested_at ascending
  allLogs.sort(
    (a, b) =>
      new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime(),
  );

  const lines: string[] = [];

  // Headers
  if (includeHeaders) {
    lines.push(HEADERS.map(escapeCsv).join(","));
  }

  if (groupByModel && allLogs.length > 0) {
    // Group logs by model_id, preserving sorted order
    const groups = new Map<string, UsageLog[]>();
    for (const log of allLogs) {
      const existing = groups.get(log.model_id) ?? [];
      existing.push(log);
      groups.set(log.model_id, existing);
    }

    for (const [modelId, groupLogs] of groups) {
      for (const log of groupLogs) {
        lines.push(formatRow(log));
      }
      // Subtotal row for this model group
      const subtotal = sumNumericFields(groupLogs);
      lines.push(formatTotalRow(`SUBTOTAL (${modelId})`, subtotal));
    }

    // Grand total
    if (includeAggregateRow) {
      const grandTotal = sumNumericFields(allLogs);
      lines.push(formatTotalRow("TOTAL", grandTotal));
    }
  } else {
    // Plain rows
    for (const log of allLogs) {
      lines.push(formatRow(log));
    }

    // Aggregate total row
    if (includeAggregateRow) {
      const total = sumNumericFields(allLogs);
      lines.push(formatTotalRow("TOTAL", total));
    }
  }

  return lines.join("\n");
}
