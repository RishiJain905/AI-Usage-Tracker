/**
 * JSON Export — convert usage logs to structured JSON with optional summaries.
 */

import type { Period, UsageFilters, UsageLog } from "../database/types";
import type { AggregateTotal, ModelBreakdown } from "../database/types";
import { UsageRepository, getPeriodDates } from "../database/repository";
import type { CsvExportOptions } from "./csv";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface JsonExportOptions extends CsvExportOptions {
  includeSummary?: boolean;
  includePerModelSummary?: boolean;
  pretty?: boolean;
}

// ---------------------------------------------------------------------------
// JSON output structure
// ---------------------------------------------------------------------------

interface JsonExportOutput {
  exportedAt: string;
  exportedBy: string;
  dateRange: { start: string | null; end: string | null };
  period: Period | null;
  aggregateSummary: AggregateTotal | null;
  perModelSummary: ModelBreakdown[] | null;
  logs: UsageLog[];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function exportToJson(
  repository: UsageRepository,
  options: JsonExportOptions,
): string {
  const {
    dateRange,
    period,
    providers,
    models,
    includeSummary = false,
    includePerModelSummary = false,
    pretty = false,
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

  // Build filters and fetch logs
  let allLogs: UsageLog[] = [];

  if (providers && providers.length > 0) {
    for (const providerId of providers) {
      if (models && models.length > 0) {
        for (const modelId of models) {
          const filters: UsageFilters = {
            providerId,
            modelId,
            startDate,
            endDate,
            limit: 100000,
            offset: 0,
          };
          allLogs = allLogs.concat(repository.getUsageLogs(filters));
        }
      } else {
        const filters: UsageFilters = {
          providerId,
          startDate,
          endDate,
          limit: 100000,
          offset: 0,
        };
        allLogs = allLogs.concat(repository.getUsageLogs(filters));
      }
    }
  } else if (models && models.length > 0) {
    for (const modelId of models) {
      const filters: UsageFilters = {
        modelId,
        startDate,
        endDate,
        limit: 100000,
        offset: 0,
      };
      allLogs = allLogs.concat(repository.getUsageLogs(filters));
    }
  } else {
    const filters: UsageFilters = {
      startDate,
      endDate,
      limit: 100000,
      offset: 0,
    };
    allLogs = repository.getUsageLogs(filters);
  }

  // Sort by requested_at ascending
  allLogs.sort(
    (a, b) =>
      new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime(),
  );

  // Build output
  const output: JsonExportOutput = {
    exportedAt: new Date().toISOString(),
    exportedBy: "AI Usage Tracker",
    dateRange:
      startDate && endDate
        ? { start: startDate, end: endDate }
        : { start: null, end: null },
    period: period ?? null,
    aggregateSummary: null,
    perModelSummary: null,
    logs: allLogs,
  };

  if (includeSummary && period) {
    output.aggregateSummary = repository.getAggregateTotal(period);
  }

  if (includePerModelSummary && period) {
    output.perModelSummary = repository.getAllModelSummaries(period);
  }

  return JSON.stringify(output, null, pretty ? 2 : 0);
}
