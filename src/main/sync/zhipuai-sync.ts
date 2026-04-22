/**
 * ZhipuAI Sync — fetch usage data from ZhipuAI API and import into local database.
 */

import type { UsageLog, InsertUsageLogInput } from "../database/types";
import type { UsageRepository } from "../database/repository";
import { format, startOfWeek } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZhipuAiModelUsage {
  date: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

export interface SyncResult {
  providerId: string;
  importedCount: number;
  skippedCount: number;
  totalTokens: number;
  totalCost: number;
  syncRange: { start: string; end: string };
}

// ---------------------------------------------------------------------------
// ZhipuAI Sync class
// ---------------------------------------------------------------------------

export class ZhipuAiSync {
  readonly providerId = "glm";

  /**
   * Sync usage data from ZhipuAI API since the given date.
   */
  async sync(
    repository: UsageRepository,
    apiKey: string,
    since: string,
  ): Promise<SyncResult> {
    const remoteData = await this.fetchModelUsage(apiKey, since);

    if (remoteData.length === 0) {
      return {
        providerId: this.providerId,
        importedCount: 0,
        skippedCount: 0,
        totalTokens: 0,
        totalCost: 0,
        syncRange: { start: since, end: format(new Date(), "yyyy-MM-dd") },
      };
    }

    // Get existing logs for comparison
    const existingLogs = repository.getUsageLogs({
      providerId: this.providerId,
      startDate: since,
      limit: 100000,
      offset: 0,
    });

    const missing = this.findMissing(remoteData, existingLogs);

    // Track affected dates for summary recalculation
    const affectedDates = new Set<string>();
    let totalTokens = 0;
    let totalCost = 0;

    // Insert missing entries
    for (const entry of missing) {
      const input: InsertUsageLogInput = {
        provider_id: this.providerId,
        model_id: entry.model,
        prompt_tokens: entry.prompt_tokens,
        completion_tokens: entry.completion_tokens,
        total_tokens: entry.total_tokens,
        input_cost: entry.cost * 0.4, // approximate split
        output_cost: entry.cost * 0.6,
        total_cost: entry.cost,
        source: "sync",
        is_estimated: true,
        estimation_source: "zhipuai-sync",
        requested_at: `${entry.date}T00:00:00.000Z`,
      };

      repository.insertUsageLog(input);
      affectedDates.add(entry.date);
      totalTokens += entry.total_tokens;
      totalCost += entry.cost;
    }

    // Recalculate daily and weekly summaries for affected dates
    this.recalculateSummaries(repository, affectedDates);

    // Store last sync timestamp
    repository.setSetting("last_sync_zhipuai", new Date().toISOString());

    // Determine sync range
    const dates = remoteData.map((d) => d.date).sort();
    const syncRange = {
      start: dates[0],
      end: dates[dates.length - 1],
    };

    return {
      providerId: this.providerId,
      importedCount: missing.length,
      skippedCount: remoteData.length - missing.length,
      totalTokens,
      totalCost,
      syncRange,
    };
  }

  /**
   * Fetch model usage data from ZhipuAI API.
   */
  private async fetchModelUsage(
    apiKey: string,
    since: string,
  ): Promise<ZhipuAiModelUsage[]> {
    const url = `https://api.z.ai/api/monitor/usage/model-usage?since=${since}`;

    const response = await fetch(url, {
      headers: {
        Authorization: apiKey, // NO "Bearer" prefix
      },
    });

    if (!response.ok) {
      throw new Error(
        `ZhipuAI API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Handle response as array of model usage aggregates
    if (Array.isArray(data)) {
      return data as ZhipuAiModelUsage[];
    }

    // Handle wrapped response
    if (data && Array.isArray(data.data)) {
      return data.data as ZhipuAiModelUsage[];
    }

    return [];
  }

  /**
   * Identify remote entries that are not already tracked in usage_logs.
   * Compares by date + model + approximate token counts.
   */
  findMissing(
    remoteData: ZhipuAiModelUsage[],
    existingLogs: UsageLog[],
  ): ZhipuAiModelUsage[] {
    // Build a set of existing entries for fast lookup
    const existingKeys = new Set<string>();
    for (const log of existingLogs) {
      const logDate = log.requested_at.slice(0, 10);
      // Key: date|model|approximate_tokens (within 5% tolerance for tokens)
      existingKeys.add(
        `${logDate}|${log.model_id}|${Math.round(log.total_tokens * 0.95)}-${Math.round(log.total_tokens * 1.05)}`,
      );
    }

    return remoteData.filter((entry) => {
      // Check if there's a matching existing log for this date+model
      const matchingLogs = existingLogs.filter(
        (log) =>
          log.requested_at.slice(0, 10) === entry.date &&
          log.model_id === entry.model,
      );

      // If no existing logs for this date+model, it's missing
      if (matchingLogs.length === 0) {
        return true;
      }

      // Check if any existing log has approximately matching token counts
      for (const log of matchingLogs) {
        const ratio =
          log.total_tokens > 0 ? entry.total_tokens / log.total_tokens : 0;
        if (ratio >= 0.95 && ratio <= 1.05) {
          // Already tracked
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Recalculate daily and weekly summaries for the affected dates.
   */
  private recalculateSummaries(
    repository: UsageRepository,
    affectedDates: Set<string>,
  ): void {
    const affectedWeeks = new Set<string>();

    for (const date of affectedDates) {
      repository.deleteDailySummaryByDate(date);

      // Get all logs for this date and provider
      const logs = repository.getUsageLogs({
        providerId: this.providerId,
        startDate: date,
        endDate: date,
        limit: 100000,
        offset: 0,
      });

      // Group logs by model
      const byModel = new Map<string, typeof logs>();
      for (const log of logs) {
        const existing = byModel.get(log.model_id) ?? [];
        existing.push(log);
        byModel.set(log.model_id, existing);
      }

      // Upsert daily summary for each model
      for (const [modelId, modelLogs] of byModel) {
        const summary = {
          request_count: modelLogs.length,
          prompt_tokens: modelLogs.reduce((s, l) => s + l.prompt_tokens, 0),
          completion_tokens: modelLogs.reduce(
            (s, l) => s + l.completion_tokens,
            0,
          ),
          total_tokens: modelLogs.reduce((s, l) => s + l.total_tokens, 0),
          input_cost: modelLogs.reduce((s, l) => s + l.input_cost, 0),
          output_cost: modelLogs.reduce((s, l) => s + l.output_cost, 0),
          total_cost: modelLogs.reduce((s, l) => s + l.total_cost, 0),
        };
        repository.upsertDailySummary(date, this.providerId, modelId, summary);
      }

      // Upsert weekly summary
      const weekStart = format(
        startOfWeek(new Date(date), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      affectedWeeks.add(weekStart);
    }

    for (const weekStart of affectedWeeks) {
      repository.deleteWeeklySummaryByWeekStart(weekStart);
    }

    for (const date of affectedDates) {
      const logs = repository.getUsageLogs({
        providerId: this.providerId,
        startDate: date,
        endDate: date,
        limit: 100000,
        offset: 0,
      });

      const byModel = new Map<string, typeof logs>();
      for (const log of logs) {
        const existing = byModel.get(log.model_id) ?? [];
        existing.push(log);
        byModel.set(log.model_id, existing);
      }

      const weekStart = format(
        startOfWeek(new Date(date), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      for (const [modelId, modelLogs] of byModel) {
        const summary = {
          request_count: modelLogs.length,
          prompt_tokens: modelLogs.reduce((s, l) => s + l.prompt_tokens, 0),
          completion_tokens: modelLogs.reduce(
            (s, l) => s + l.completion_tokens,
            0,
          ),
          total_tokens: modelLogs.reduce((s, l) => s + l.total_tokens, 0),
          input_cost: modelLogs.reduce((s, l) => s + l.input_cost, 0),
          output_cost: modelLogs.reduce((s, l) => s + l.output_cost, 0),
          total_cost: modelLogs.reduce((s, l) => s + l.total_cost, 0),
        };
        repository.upsertWeeklySummary(
          weekStart,
          this.providerId,
          modelId,
          summary,
        );
      }
    }
  }
}
