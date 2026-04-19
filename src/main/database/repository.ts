/**
 * Data access layer — UsageRepository
 *
 * Provides typed, prepared-statement-backed access to all database tables.
 * All SQL queries use parameterised placeholders — never string interpolation.
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfDay,
  endOfWeek,
  endOfMonth,
  format,
  subDays,
  subWeeks,
} from "date-fns";

import type {
  UsageLog,
  DailySummary,
  WeeklySummary,
  Period,
  UsageFilters,
  InsertUsageLogInput,
  UpsertSummaryInput,
  AggregateTotal,
  ModelBreakdown,
  ModelUsage,
  DailyTrend,
  WeeklyTrend,
  ProviderSummary,
  UsageSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Period → date range helper
// ---------------------------------------------------------------------------

export function getPeriodDates(period: Period): { start: string; end: string } {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = format(startOfDay(now), "yyyy-MM-dd");
      const end = format(endOfDay(now), "yyyy-MM-dd");
      return { start, end };
    }
    case "week": {
      const start = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const end = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      return { start, end };
    }
    case "month": {
      const start = format(startOfMonth(now), "yyyy-MM-dd");
      const end = format(endOfMonth(now), "yyyy-MM-dd");
      return { start, end };
    }
    case "all":
      return { start: "0001-01-01", end: "9999-12-31" };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-filled AggregateTotal for when no rows match. */
function emptyAggregate(): AggregateTotal {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    total_cost: 0,
    request_count: 0,
  };
}

/** Coerce a row from SUM() aggregation into AggregateTotal. */
function rowToAggregate(
  row: Record<string, unknown> | undefined,
): AggregateTotal {
  if (!row) return emptyAggregate();
  return {
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    input_cost: Number(row.input_cost ?? 0),
    output_cost: Number(row.output_cost ?? 0),
    total_cost: Number(row.total_cost ?? 0),
    request_count: Number(row.request_count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// UsageRepository
// ---------------------------------------------------------------------------

export class UsageRepository {
  private readonly db: Database.Database;

  // Prepared statements — initialised once in the constructor
  private readonly stmts: {
    insertUsageLog: Database.Statement;
    getUsageLogs: Database.Statement;
    getUsageSummary: Database.Statement;
    getUsageSummaryModels: Database.Statement;
    getUsageSummaryProviders: Database.Statement;
    getDailySummary: Database.Statement;
    getWeeklySummary: Database.Statement;
    getProviderSummary: Database.Statement;
    getModelSummary: Database.Statement;
    getAllModelSummaries: Database.Statement;
    getAggregateTotal: Database.Statement;
    getAggregateDailyTotal: Database.Statement;
    getAggregateWeeklyTotal: Database.Statement;
    getAggregateAllTimeTotal: Database.Statement;
    getModelBreakdownForPeriod: Database.Statement;
    getTotalTokensByProvider: Database.Statement;
    getTotalCostByProvider: Database.Statement;
    getTotalTokensByModel: Database.Statement;
    getTotalCostByModel: Database.Statement;
    getTopModels: Database.Statement;
    getUsageTrend: Database.Statement;
    getWeeklyTrend: Database.Statement;
    getSetting: Database.Statement;
    setSetting: Database.Statement;
    deleteUsageBefore: Database.Statement;
    upsertDailyInsert: Database.Statement;
    upsertDailyUpdate: Database.Statement;
    upsertDailyExisting: Database.Statement;
    upsertWeeklyInsert: Database.Statement;
    upsertWeeklyUpdate: Database.Statement;
    upsertWeeklyExisting: Database.Statement;
  } = {} as any;

  constructor(db: Database.Database) {
    this.db = db;

    // -- Insert ----------------------------------------------------------------
    this.stmts.insertUsageLog = db.prepare(`
      INSERT INTO usage_logs (
        id, provider_id, model_id, endpoint, method,
        prompt_tokens, completion_tokens, total_tokens,
        input_cost, output_cost, total_cost,
        request_duration_ms, is_streaming, is_error, error_message,
        app_name, tags, source, requested_at, completed_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    // -- Queries ---------------------------------------------------------------
    this.stmts.getUsageLogs = db.prepare(`
      SELECT * FROM usage_logs
      WHERE provider_id = COALESCE(?, provider_id)
        AND model_id = COALESCE(?, model_id)
        AND date(requested_at) >= COALESCE(?, date(requested_at))
        AND date(requested_at) <= COALESCE(?, date(requested_at))
      ORDER BY requested_at DESC
      LIMIT ? OFFSET ?
    `);

    this.stmts.getUsageSummary = db.prepare(`
      SELECT
        COALESCE(SUM(request_count), 0) AS total_requests,
        COALESCE(SUM(total_tokens), 0)  AS total_tokens,
        COALESCE(SUM(total_cost), 0)     AS total_cost
      FROM daily_summary
      WHERE date >= ? AND date <= ?
    `);

    this.stmts.getUsageSummaryModels = db.prepare(`
      SELECT COUNT(DISTINCT model_id) AS unique_models
      FROM daily_summary
      WHERE date >= ? AND date <= ?
    `);

    this.stmts.getUsageSummaryProviders = db.prepare(`
      SELECT COUNT(DISTINCT provider_id) AS unique_providers
      FROM daily_summary
      WHERE date >= ? AND date <= ?
    `);

    this.stmts.getDailySummary = db.prepare(`
      SELECT * FROM daily_summary
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, provider_id, model_id
    `);

    this.stmts.getWeeklySummary = db.prepare(`
      SELECT * FROM weekly_summary
      WHERE week_start >= ? AND week_start <= ?
      ORDER BY week_start DESC, provider_id, model_id
    `);

    this.stmts.getProviderSummary = db.prepare(`
      SELECT
        p.id   AS provider_id,
        p.name AS provider_name,
        COALESCE(SUM(ds.total_tokens), 0)  AS total_tokens,
        COALESCE(SUM(ds.total_cost), 0)     AS total_cost,
        COALESCE(SUM(ds.request_count), 0)  AS request_count,
        COUNT(DISTINCT ds.model_id)         AS model_count
      FROM providers p
      LEFT JOIN daily_summary ds ON ds.provider_id = p.id
        AND ds.date >= ? AND ds.date <= ?
      WHERE p.id = ?
      GROUP BY p.id
    `);

    this.stmts.getModelSummary = db.prepare(`
      SELECT
        ds.model_id,
        m.name  AS model_name,
        ds.provider_id,
        p.name  AS provider_name,
        COALESCE(SUM(ds.prompt_tokens), 0)     AS prompt_tokens,
        COALESCE(SUM(ds.completion_tokens), 0)  AS completion_tokens,
        COALESCE(SUM(ds.total_tokens), 0)       AS total_tokens,
        COALESCE(SUM(ds.input_cost), 0)         AS input_cost,
        COALESCE(SUM(ds.output_cost), 0)        AS output_cost,
        COALESCE(SUM(ds.total_cost), 0)         AS total_cost,
        COALESCE(SUM(ds.request_count), 0)      AS request_count
      FROM daily_summary ds
      JOIN models m  ON ds.model_id = m.id
      JOIN providers p ON ds.provider_id = p.id
      WHERE ds.model_id = ?
        AND ds.date >= ? AND ds.date <= ?
      GROUP BY ds.model_id
    `);

    this.stmts.getAllModelSummaries = db.prepare(`
      SELECT
        ds.model_id,
        m.name  AS model_name,
        ds.provider_id,
        p.name  AS provider_name,
        COALESCE(SUM(ds.prompt_tokens), 0)     AS prompt_tokens,
        COALESCE(SUM(ds.completion_tokens), 0)  AS completion_tokens,
        COALESCE(SUM(ds.total_tokens), 0)       AS total_tokens,
        COALESCE(SUM(ds.input_cost), 0)         AS input_cost,
        COALESCE(SUM(ds.output_cost), 0)        AS output_cost,
        COALESCE(SUM(ds.total_cost), 0)         AS total_cost,
        COALESCE(SUM(ds.request_count), 0)      AS request_count
      FROM daily_summary ds
      JOIN models m  ON ds.model_id = m.id
      JOIN providers p ON ds.provider_id = p.id
      WHERE ds.date >= ? AND ds.date <= ?
      GROUP BY ds.model_id
      ORDER BY total_tokens DESC
    `);

    this.stmts.getAggregateTotal = db.prepare(`
      SELECT
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(input_cost)        AS input_cost,
        SUM(output_cost)       AS output_cost,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM daily_summary
      WHERE date >= ? AND date <= ?
    `);

    this.stmts.getAggregateDailyTotal = db.prepare(`
      SELECT
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(input_cost)        AS input_cost,
        SUM(output_cost)       AS output_cost,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM daily_summary
      WHERE date = ?
    `);

    this.stmts.getAggregateWeeklyTotal = db.prepare(`
      SELECT
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(input_cost)        AS input_cost,
        SUM(output_cost)       AS output_cost,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM weekly_summary
      WHERE week_start = ?
    `);

    this.stmts.getAggregateAllTimeTotal = db.prepare(`
      SELECT
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(input_cost)        AS input_cost,
        SUM(output_cost)       AS output_cost,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM daily_summary
    `);

    this.stmts.getModelBreakdownForPeriod = db.prepare(`
      SELECT
        ds.model_id,
        m.name  AS model_name,
        ds.provider_id,
        p.name  AS provider_name,
        SUM(ds.prompt_tokens)     AS prompt_tokens,
        SUM(ds.completion_tokens) AS completion_tokens,
        SUM(ds.total_tokens)      AS total_tokens,
        SUM(ds.input_cost)        AS input_cost,
        SUM(ds.output_cost)       AS output_cost,
        SUM(ds.total_cost)        AS total_cost,
        SUM(ds.request_count)     AS request_count
      FROM daily_summary ds
      JOIN models m  ON ds.model_id = m.id
      JOIN providers p ON ds.provider_id = p.id
      WHERE ds.date >= ? AND ds.date <= ?
      GROUP BY ds.model_id
      ORDER BY total_tokens DESC
    `);

    this.stmts.getTotalTokensByProvider = db.prepare(`
      SELECT provider_id, SUM(total_tokens) AS total_tokens
      FROM daily_summary
      WHERE date >= ? AND date <= ?
      GROUP BY provider_id
    `);

    this.stmts.getTotalCostByProvider = db.prepare(`
      SELECT provider_id, SUM(total_cost) AS total_cost
      FROM daily_summary
      WHERE date >= ? AND date <= ?
      GROUP BY provider_id
    `);

    this.stmts.getTotalTokensByModel = db.prepare(`
      SELECT model_id, SUM(total_tokens) AS total_tokens
      FROM daily_summary
      WHERE date >= ? AND date <= ?
      GROUP BY model_id
    `);

    this.stmts.getTotalCostByModel = db.prepare(`
      SELECT model_id, SUM(total_cost) AS total_cost
      FROM daily_summary
      WHERE date >= ? AND date <= ?
      GROUP BY model_id
    `);

    this.stmts.getTopModels = db.prepare(`
      SELECT
        ds.model_id,
        m.name AS model_name,
        SUM(ds.total_tokens)  AS total_tokens,
        SUM(ds.total_cost)    AS total_cost,
        SUM(ds.request_count) AS request_count
      FROM daily_summary ds
      JOIN models m ON ds.model_id = m.id
      WHERE ds.date >= ? AND ds.date <= ?
      GROUP BY ds.model_id
      ORDER BY total_tokens DESC
      LIMIT ?
    `);

    this.stmts.getUsageTrend = db.prepare(`
      SELECT
        date,
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM daily_summary
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
    `);

    this.stmts.getWeeklyTrend = db.prepare(`
      SELECT
        week_start,
        SUM(prompt_tokens)     AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens)      AS total_tokens,
        SUM(total_cost)        AS total_cost,
        SUM(request_count)     AS request_count
      FROM weekly_summary
      WHERE week_start >= ?
      GROUP BY week_start
      ORDER BY week_start ASC
    `);

    // -- Settings --------------------------------------------------------------
    this.stmts.getSetting = db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `);

    this.stmts.setSetting = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);

    // -- Cleanup ---------------------------------------------------------------
    this.stmts.deleteUsageBefore = db.prepare(`
      DELETE FROM usage_logs WHERE requested_at < ?
    `);

    // -- Upsert helpers --------------------------------------------------------
    this.stmts.upsertDailyExisting = db.prepare(`
      SELECT id, request_count, prompt_tokens, completion_tokens, total_tokens,
             input_cost, output_cost, total_cost, error_count, avg_duration_ms
      FROM daily_summary
      WHERE date = ? AND provider_id = ? AND model_id = ?
    `);

    this.stmts.upsertDailyInsert = db.prepare(`
      INSERT INTO daily_summary (
        id, date, provider_id, model_id,
        request_count, prompt_tokens, completion_tokens, total_tokens,
        input_cost, output_cost, total_cost, error_count, avg_duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmts.upsertDailyUpdate = db.prepare(`
      UPDATE daily_summary SET
        request_count = ?,
        prompt_tokens = ?,
        completion_tokens = ?,
        total_tokens = ?,
        input_cost = ?,
        output_cost = ?,
        total_cost = ?,
        error_count = ?,
        avg_duration_ms = ?
      WHERE id = ?
    `);

    this.stmts.upsertWeeklyExisting = db.prepare(`
      SELECT id, request_count, prompt_tokens, completion_tokens, total_tokens,
             input_cost, output_cost, total_cost, error_count, avg_duration_ms
      FROM weekly_summary
      WHERE week_start = ? AND provider_id = ? AND model_id = ?
    `);

    this.stmts.upsertWeeklyInsert = db.prepare(`
      INSERT INTO weekly_summary (
        id, week_start, provider_id, model_id,
        request_count, prompt_tokens, completion_tokens, total_tokens,
        input_cost, output_cost, total_cost, error_count, avg_duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmts.upsertWeeklyUpdate = db.prepare(`
      UPDATE weekly_summary SET
        request_count = ?,
        prompt_tokens = ?,
        completion_tokens = ?,
        total_tokens = ?,
        input_cost = ?,
        output_cost = ?,
        total_cost = ?,
        error_count = ?,
        avg_duration_ms = ?
      WHERE id = ?
    `);
  }

  // ---------------------------------------------------------------------------
  // Insert
  // ---------------------------------------------------------------------------

  insertUsageLog(log: InsertUsageLogInput): UsageLog {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.stmts.insertUsageLog.run(
      id,
      log.provider_id,
      log.model_id,
      log.endpoint ?? null,
      log.method ?? "POST",
      log.prompt_tokens,
      log.completion_tokens,
      log.total_tokens,
      log.input_cost,
      log.output_cost,
      log.total_cost,
      log.request_duration_ms ?? null,
      log.is_streaming ? 1 : 0,
      log.is_error ? 1 : 0,
      log.error_message ?? null,
      log.app_name ?? null,
      log.tags ?? null,
      log.source ?? "proxy",
      log.requested_at,
      log.completed_at ?? null,
      createdAt,
    );

    return {
      id,
      provider_id: log.provider_id,
      model_id: log.model_id,
      endpoint: log.endpoint ?? null,
      method: log.method ?? "POST",
      prompt_tokens: log.prompt_tokens,
      completion_tokens: log.completion_tokens,
      total_tokens: log.total_tokens,
      input_cost: log.input_cost,
      output_cost: log.output_cost,
      total_cost: log.total_cost,
      request_duration_ms: log.request_duration_ms ?? null,
      is_streaming: log.is_streaming ?? false,
      is_error: log.is_error ?? false,
      error_message: log.error_message ?? null,
      app_name: log.app_name ?? null,
      tags: log.tags ?? null,
      source: log.source ?? "proxy",
      requested_at: log.requested_at,
      completed_at: log.completed_at ?? null,
      created_at: createdAt,
    };
  }

  upsertDailySummary(
    date: string,
    providerId: string,
    modelId: string,
    data: UpsertSummaryInput,
  ): void {
    const existing = this.stmts.upsertDailyExisting.get(
      date,
      providerId,
      modelId,
    ) as Record<string, unknown> | undefined;

    if (existing) {
      const existingId = existing.id as string;
      const oldCount = Number(existing.request_count);
      const newCount = oldCount + data.request_count;
      const oldAvg = Number(existing.avg_duration_ms);

      // Weighted average for duration
      const newAvgDuration =
        newCount > 0
          ? (oldAvg * oldCount +
              (data.avg_duration_ms ?? 0) * data.request_count) /
            newCount
          : 0;

      this.stmts.upsertDailyUpdate.run(
        newCount,
        Number(existing.prompt_tokens) + data.prompt_tokens,
        Number(existing.completion_tokens) + data.completion_tokens,
        Number(existing.total_tokens) + data.total_tokens,
        Number(existing.input_cost) + data.input_cost,
        Number(existing.output_cost) + data.output_cost,
        Number(existing.total_cost) + data.total_cost,
        Number(existing.error_count) + (data.error_count ?? 0),
        newAvgDuration,
        existingId,
      );
    } else {
      this.stmts.upsertDailyInsert.run(
        uuidv4(),
        date,
        providerId,
        modelId,
        data.request_count,
        data.prompt_tokens,
        data.completion_tokens,
        data.total_tokens,
        data.input_cost,
        data.output_cost,
        data.total_cost,
        data.error_count ?? 0,
        data.avg_duration_ms ?? 0,
      );
    }
  }

  upsertWeeklySummary(
    weekStart: string,
    providerId: string,
    modelId: string,
    data: UpsertSummaryInput,
  ): void {
    const existing = this.stmts.upsertWeeklyExisting.get(
      weekStart,
      providerId,
      modelId,
    ) as Record<string, unknown> | undefined;

    if (existing) {
      const existingId = existing.id as string;
      const oldCount = Number(existing.request_count);
      const newCount = oldCount + data.request_count;
      const oldAvg = Number(existing.avg_duration_ms);

      const newAvgDuration =
        newCount > 0
          ? (oldAvg * oldCount +
              (data.avg_duration_ms ?? 0) * data.request_count) /
            newCount
          : 0;

      this.stmts.upsertWeeklyUpdate.run(
        newCount,
        Number(existing.prompt_tokens) + data.prompt_tokens,
        Number(existing.completion_tokens) + data.completion_tokens,
        Number(existing.total_tokens) + data.total_tokens,
        Number(existing.input_cost) + data.input_cost,
        Number(existing.output_cost) + data.output_cost,
        Number(existing.total_cost) + data.total_cost,
        Number(existing.error_count) + (data.error_count ?? 0),
        newAvgDuration,
        existingId,
      );
    } else {
      this.stmts.upsertWeeklyInsert.run(
        uuidv4(),
        weekStart,
        providerId,
        modelId,
        data.request_count,
        data.prompt_tokens,
        data.completion_tokens,
        data.total_tokens,
        data.input_cost,
        data.output_cost,
        data.total_cost,
        data.error_count ?? 0,
        data.avg_duration_ms ?? 0,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Queries — PERIOD-AWARE
  // ---------------------------------------------------------------------------

  getUsageLogs(filters: UsageFilters): UsageLog[] {
    return this.stmts.getUsageLogs.all(
      filters.providerId ?? null,
      filters.modelId ?? null,
      filters.startDate ?? null,
      filters.endDate ?? null,
      filters.limit ?? 100,
      filters.offset ?? 0,
    ) as UsageLog[];
  }

  getUsageSummary(period: Period): UsageSummary {
    const { start, end } = getPeriodDates(period);

    const summaryRow = this.stmts.getUsageSummary.get(start, end) as Record<
      string,
      unknown
    >;
    const modelsRow = this.stmts.getUsageSummaryModels.get(
      start,
      end,
    ) as Record<string, unknown>;
    const providersRow = this.stmts.getUsageSummaryProviders.get(
      start,
      end,
    ) as Record<string, unknown>;

    return {
      total_requests: Number(summaryRow?.total_requests ?? 0),
      total_tokens: Number(summaryRow?.total_tokens ?? 0),
      total_cost: Number(summaryRow?.total_cost ?? 0),
      unique_models: Number(modelsRow?.unique_models ?? 0),
      unique_providers: Number(providersRow?.unique_providers ?? 0),
      period,
    };
  }

  getDailySummary(dateRange: { start: string; end: string }): DailySummary[] {
    return this.stmts.getDailySummary.all(
      dateRange.start,
      dateRange.end,
    ) as DailySummary[];
  }

  getWeeklySummary(weekRange: { start: string; end: string }): WeeklySummary[] {
    return this.stmts.getWeeklySummary.all(
      weekRange.start,
      weekRange.end,
    ) as WeeklySummary[];
  }

  getProviderSummary(providerId: string, period: Period): ProviderSummary {
    const { start, end } = getPeriodDates(period);

    const row = this.stmts.getProviderSummary.get(
      start,
      end,
      providerId,
    ) as Record<string, unknown>;

    if (!row) {
      return {
        provider_id: providerId,
        provider_name: "",
        total_tokens: 0,
        total_cost: 0,
        request_count: 0,
        model_count: 0,
      };
    }

    return {
      provider_id: row.provider_id as string,
      provider_name: row.provider_name as string,
      total_tokens: Number(row.total_tokens),
      total_cost: Number(row.total_cost),
      request_count: Number(row.request_count),
      model_count: Number(row.model_count),
    };
  }

  // ---------------------------------------------------------------------------
  // PER-MODEL queries
  // ---------------------------------------------------------------------------

  getModelSummary(modelId: string, period: Period): ModelBreakdown {
    const { start, end } = getPeriodDates(period);

    const row = this.stmts.getModelSummary.get(modelId, start, end) as Record<
      string,
      unknown
    > | null;

    if (!row) {
      return {
        model_id: modelId,
        model_name: "",
        provider_id: "",
        provider_name: "",
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        total_cost: 0,
        request_count: 0,
      };
    }

    return {
      model_id: row.model_id as string,
      model_name: row.model_name as string,
      provider_id: row.provider_id as string,
      provider_name: row.provider_name as string,
      prompt_tokens: Number(row.prompt_tokens),
      completion_tokens: Number(row.completion_tokens),
      total_tokens: Number(row.total_tokens),
      input_cost: Number(row.input_cost),
      output_cost: Number(row.output_cost),
      total_cost: Number(row.total_cost),
      request_count: Number(row.request_count),
    };
  }

  getAllModelSummaries(period: Period): ModelBreakdown[] {
    const { start, end } = getPeriodDates(period);
    return this.stmts.getAllModelSummaries.all(start, end) as ModelBreakdown[];
  }

  // ---------------------------------------------------------------------------
  // AGGREGATE TOTALS
  // ---------------------------------------------------------------------------

  getAggregateTotal(period: Period): AggregateTotal {
    const { start, end } = getPeriodDates(period);
    const row = this.stmts.getAggregateTotal.get(start, end) as
      | Record<string, unknown>
      | undefined;
    return rowToAggregate(row);
  }

  getAggregateDailyTotal(date: string): AggregateTotal {
    const row = this.stmts.getAggregateDailyTotal.get(date) as
      | Record<string, unknown>
      | undefined;
    return rowToAggregate(row);
  }

  getAggregateWeeklyTotal(weekStart: string): AggregateTotal {
    const row = this.stmts.getAggregateWeeklyTotal.get(weekStart) as
      | Record<string, unknown>
      | undefined;
    return rowToAggregate(row);
  }

  getAggregateAllTimeTotal(): AggregateTotal {
    const row = this.stmts.getAggregateAllTimeTotal.get() as
      | Record<string, unknown>
      | undefined;
    return rowToAggregate(row);
  }

  // ---------------------------------------------------------------------------
  // Per-model breakdown within a period
  // ---------------------------------------------------------------------------

  getModelBreakdownForPeriod(period: Period): ModelBreakdown[] {
    const { start, end } = getPeriodDates(period);
    return this.stmts.getModelBreakdownForPeriod.all(
      start,
      end,
    ) as ModelBreakdown[];
  }

  // ---------------------------------------------------------------------------
  // Aggregations (period + per-model aware)
  // ---------------------------------------------------------------------------

  getTotalTokensByProvider(period: Period): Record<string, number> {
    const { start, end } = getPeriodDates(period);
    const rows = this.stmts.getTotalTokensByProvider.all(start, end) as Record<
      string,
      unknown
    >[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.provider_id as string] = Number(row.total_tokens);
    }
    return result;
  }

  getTotalCostByProvider(period: Period): Record<string, number> {
    const { start, end } = getPeriodDates(period);
    const rows = this.stmts.getTotalCostByProvider.all(start, end) as Record<
      string,
      unknown
    >[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.provider_id as string] = Number(row.total_cost);
    }
    return result;
  }

  getTotalTokensByModel(period: Period): Record<string, number> {
    const { start, end } = getPeriodDates(period);
    const rows = this.stmts.getTotalTokensByModel.all(start, end) as Record<
      string,
      unknown
    >[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.model_id as string] = Number(row.total_tokens);
    }
    return result;
  }

  getTotalCostByModel(period: Period): Record<string, number> {
    const { start, end } = getPeriodDates(period);
    const rows = this.stmts.getTotalCostByModel.all(start, end) as Record<
      string,
      unknown
    >[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.model_id as string] = Number(row.total_cost);
    }
    return result;
  }

  getTopModels(limit: number, period: Period): ModelUsage[] {
    const { start, end } = getPeriodDates(period);
    return this.stmts.getTopModels.all(start, end, limit) as ModelUsage[];
  }

  getUsageTrend(days: number): DailyTrend[] {
    const start = format(subDays(new Date(), days), "yyyy-MM-dd");
    return this.stmts.getUsageTrend.all(start) as DailyTrend[];
  }

  getWeeklyTrend(weeks: number): WeeklyTrend[] {
    const start = format(
      startOfWeek(subWeeks(new Date(), weeks), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    return this.stmts.getWeeklyTrend.all(start) as WeeklyTrend[];
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSetting(key: string): string | null {
    const row = this.stmts.getSetting.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.stmts.setSetting.run(key, value);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  deleteUsageBefore(date: string): number {
    const result = this.stmts.deleteUsageBefore.run(date);
    return result.changes;
  }

  vacuum(): void {
    this.db.exec("VACUUM");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRepository(db: Database.Database): UsageRepository {
  return new UsageRepository(db);
}
