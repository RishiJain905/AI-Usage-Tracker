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
  AggregateTotal,
  ApiKey,
  ApiKeyMetadata,
  ClearAllDataResult,
  ClearUsageDataResult,
  DailySummary,
  DailyTrend,
  InsertUsageLogInput,
  ModelBreakdown,
  ModelUsage,
  Period,
  ProviderApiKeyMetadata,
  ProviderSummary,
  SettingMetadata,
  UpsertSummaryInput,
  UsageFilters,
  UsageLog,
  UsageSummary,
  WeeklySummary,
  WeeklyTrend,
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
    estimated_request_count: 0,
    cached_read_tokens: 0,
    cached_write_tokens: 0,
    image_tokens: 0,
    audio_tokens: 0,
    reasoning_tokens: 0,
    image_count: 0,
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
    estimated_request_count: Number(row.estimated_request_count ?? 0),
    cached_read_tokens: Number(row.cached_read_tokens ?? 0),
    cached_write_tokens: Number(row.cached_write_tokens ?? 0),
    image_tokens: Number(row.image_tokens ?? 0),
    audio_tokens: Number(row.audio_tokens ?? 0),
    reasoning_tokens: Number(row.reasoning_tokens ?? 0),
    image_count: Number(row.image_count ?? 0),
  };
}

function rowToApiKey(row: Record<string, unknown> | undefined): ApiKey | null {
  if (!row) return null;
  return {
    id: String(row.id),
    provider_id: String(row.provider_id),
    encrypted_key: String(row.encrypted_key),
    is_valid: Boolean(row.is_valid),
    last_validated_at: (row.last_validated_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function rowToApiKeyMetadata(
  row: Record<string, unknown> | undefined,
): ApiKeyMetadata | null {
  const apiKey = rowToApiKey(row);
  if (!apiKey) return null;
  return {
    id: apiKey.id,
    provider_id: apiKey.provider_id,
    is_valid: apiKey.is_valid,
    last_validated_at: apiKey.last_validated_at,
    created_at: apiKey.created_at,
  };
}

function rowToProviderApiKeyMetadata(
  row: Record<string, unknown> | undefined,
): ProviderApiKeyMetadata | null {
  if (!row) return null;
  return {
    provider_id: String(row.provider_id),
    provider_name: String(row.provider_name),
    has_api_key: Boolean(row.has_api_key),
    is_valid:
      row.is_valid === null || row.is_valid === undefined
        ? null
        : Boolean(row.is_valid),
    last_validated_at: (row.last_validated_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

function normalizeFilterValues(value?: string | string[]): string[] {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function buildInClause(values: string[]): { sql: string; params: string[] } {
  if (values.length === 0) {
    return { sql: "", params: [] };
  }

  return {
    sql: `(${values.map(() => "?").join(", ")})`,
    params: values,
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
    getSettingsMetadata: Database.Statement;
    setSetting: Database.Statement;
    deleteSetting: Database.Statement;
    clearSettings: Database.Statement;
    ensureProvider: Database.Statement;
    ensureModel: Database.Statement;
    getApiKeyByProvider: Database.Statement;
    listApiKeyMetadata: Database.Statement;
    getProviderApiKeyMetadata: Database.Statement;
    setApiKeyInsert: Database.Statement;
    setApiKeyUpdate: Database.Statement;
    setApiKeyValidation: Database.Statement;
    deleteApiKeyByProvider: Database.Statement;
    clearApiKeys: Database.Statement;
    clearUsageLogs: Database.Statement;
    clearDailySummary: Database.Statement;
    clearWeeklySummary: Database.Statement;
    deleteDailySummaryByDate: Database.Statement;
    deleteWeeklySummaryByWeekStart: Database.Statement;
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
        app_name, tags, source, is_estimated, estimation_source,
        pricing_source, cached_read_tokens, cached_write_tokens,
        image_tokens, audio_tokens, reasoning_tokens, image_count,
        estimated_request_count, requested_at, completed_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
        SUM(request_count)     AS request_count,
        SUM(estimated_request_count) AS estimated_request_count,
        SUM(cached_read_tokens) AS cached_read_tokens,
        SUM(cached_write_tokens) AS cached_write_tokens,
        SUM(image_tokens) AS image_tokens,
        SUM(audio_tokens) AS audio_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(image_count) AS image_count
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
        SUM(request_count)     AS request_count,
        SUM(estimated_request_count) AS estimated_request_count,
        SUM(cached_read_tokens) AS cached_read_tokens,
        SUM(cached_write_tokens) AS cached_write_tokens,
        SUM(image_tokens) AS image_tokens,
        SUM(audio_tokens) AS audio_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(image_count) AS image_count
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
        SUM(request_count)     AS request_count,
        SUM(estimated_request_count) AS estimated_request_count,
        SUM(cached_read_tokens) AS cached_read_tokens,
        SUM(cached_write_tokens) AS cached_write_tokens,
        SUM(image_tokens) AS image_tokens,
        SUM(audio_tokens) AS audio_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(image_count) AS image_count
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
        SUM(request_count)     AS request_count,
        SUM(estimated_request_count) AS estimated_request_count,
        SUM(cached_read_tokens) AS cached_read_tokens,
        SUM(cached_write_tokens) AS cached_write_tokens,
        SUM(image_tokens) AS image_tokens,
        SUM(audio_tokens) AS audio_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(image_count) AS image_count
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

    this.stmts.getSettingsMetadata = db.prepare(`
      SELECT key, updated_at
      FROM settings
      ORDER BY key ASC
    `);

    this.stmts.setSetting = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);

    this.stmts.deleteSetting = db.prepare(`
      DELETE FROM settings WHERE key = ?
    `);

    this.stmts.clearSettings = db.prepare(`
      DELETE FROM settings
    `);

    this.stmts.ensureProvider = db.prepare(`
      INSERT OR IGNORE INTO providers (id, name, base_url, icon)
      VALUES (?, ?, ?, NULL)
    `);

    this.stmts.ensureModel = db.prepare(`
      INSERT OR IGNORE INTO models (
        id, provider_id, name, input_price_per_million,
        output_price_per_million, is_local
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    // -- API keys --------------------------------------------------------------
    this.stmts.getApiKeyByProvider = db.prepare(`
      SELECT id, provider_id, encrypted_key, is_valid, last_validated_at, created_at
      FROM api_keys
      WHERE provider_id = ?
      ORDER BY datetime(created_at) DESC, rowid DESC
      LIMIT 1
    `);

    this.stmts.listApiKeyMetadata = db.prepare(`
      SELECT
        p.id AS provider_id,
        p.name AS provider_name,
        CASE WHEN ak.id IS NULL THEN 0 ELSE 1 END AS has_api_key,
        CASE WHEN ak.id IS NULL THEN NULL ELSE ak.is_valid END AS is_valid,
        ak.last_validated_at AS last_validated_at,
        ak.created_at AS created_at
      FROM providers p
      LEFT JOIN api_keys ak ON ak.id = (
        SELECT id
        FROM api_keys
        WHERE provider_id = p.id
        ORDER BY datetime(created_at) DESC, rowid DESC
        LIMIT 1
      )
      ORDER BY p.name ASC
    `);

    this.stmts.getProviderApiKeyMetadata = db.prepare(`
      SELECT
        p.id AS provider_id,
        p.name AS provider_name,
        CASE WHEN ak.id IS NULL THEN 0 ELSE 1 END AS has_api_key,
        CASE WHEN ak.id IS NULL THEN NULL ELSE ak.is_valid END AS is_valid,
        ak.last_validated_at AS last_validated_at,
        ak.created_at AS created_at
      FROM providers p
      LEFT JOIN api_keys ak ON ak.id = (
        SELECT id
        FROM api_keys
        WHERE provider_id = p.id
        ORDER BY datetime(created_at) DESC, rowid DESC
        LIMIT 1
      )
      WHERE p.id = ?
    `);

    this.stmts.setApiKeyInsert = db.prepare(`
      INSERT INTO api_keys (
        id, provider_id, encrypted_key, is_valid, last_validated_at, created_at
      ) VALUES (?, ?, ?, 1, NULL, datetime('now'))
    `);

    this.stmts.setApiKeyUpdate = db.prepare(`
      UPDATE api_keys
      SET encrypted_key = ?, is_valid = 1, last_validated_at = NULL
      WHERE id = ?
    `);

    this.stmts.setApiKeyValidation = db.prepare(`
      UPDATE api_keys
      SET is_valid = ?, last_validated_at = ?
      WHERE id = ?
    `);

    this.stmts.deleteApiKeyByProvider = db.prepare(`
      DELETE FROM api_keys WHERE provider_id = ?
    `);

    this.stmts.clearApiKeys = db.prepare(`
      DELETE FROM api_keys
    `);

    // -- Cleanup ---------------------------------------------------------------
    this.stmts.clearUsageLogs = db.prepare(`
      DELETE FROM usage_logs
    `);

    this.stmts.clearDailySummary = db.prepare(`
      DELETE FROM daily_summary
    `);

    this.stmts.clearWeeklySummary = db.prepare(`
      DELETE FROM weekly_summary
    `);

    this.stmts.deleteDailySummaryByDate = db.prepare(`
      DELETE FROM daily_summary WHERE date = ?
    `);

    this.stmts.deleteWeeklySummaryByWeekStart = db.prepare(`
      DELETE FROM weekly_summary WHERE week_start = ?
    `);

    this.stmts.deleteUsageBefore = db.prepare(`
      DELETE FROM usage_logs WHERE requested_at < ?
    `);

    // -- Upsert helpers --------------------------------------------------------
    this.stmts.upsertDailyExisting = db.prepare(`
      SELECT id, request_count, prompt_tokens, completion_tokens, total_tokens,
             input_cost, output_cost, total_cost, error_count, avg_duration_ms,
             estimated_request_count, cached_read_tokens, cached_write_tokens,
             image_tokens, audio_tokens, reasoning_tokens, image_count
      FROM daily_summary
      WHERE date = ? AND provider_id = ? AND model_id = ?
    `);

    this.stmts.upsertDailyInsert = db.prepare(`
      INSERT INTO daily_summary (
        id, date, provider_id, model_id,
        request_count, prompt_tokens, completion_tokens, total_tokens,
        input_cost, output_cost, total_cost, error_count, avg_duration_ms,
        estimated_request_count, cached_read_tokens, cached_write_tokens,
        image_tokens, audio_tokens, reasoning_tokens, image_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        avg_duration_ms = ?,
        estimated_request_count = ?,
        cached_read_tokens = ?,
        cached_write_tokens = ?,
        image_tokens = ?,
        audio_tokens = ?,
        reasoning_tokens = ?,
        image_count = ?
      WHERE id = ?
    `);

    this.stmts.upsertWeeklyExisting = db.prepare(`
      SELECT id, request_count, prompt_tokens, completion_tokens, total_tokens,
             input_cost, output_cost, total_cost, error_count, avg_duration_ms,
             estimated_request_count, cached_read_tokens, cached_write_tokens,
             image_tokens, audio_tokens, reasoning_tokens, image_count
      FROM weekly_summary
      WHERE week_start = ? AND provider_id = ? AND model_id = ?
    `);

    this.stmts.upsertWeeklyInsert = db.prepare(`
      INSERT INTO weekly_summary (
        id, week_start, provider_id, model_id,
        request_count, prompt_tokens, completion_tokens, total_tokens,
        input_cost, output_cost, total_cost, error_count, avg_duration_ms,
        estimated_request_count, cached_read_tokens, cached_write_tokens,
        image_tokens, audio_tokens, reasoning_tokens, image_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        avg_duration_ms = ?,
        estimated_request_count = ?,
        cached_read_tokens = ?,
        cached_write_tokens = ?,
        image_tokens = ?,
        audio_tokens = ?,
        reasoning_tokens = ?,
        image_count = ?
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
      log.is_estimated ? 1 : 0,
      log.estimation_source ?? null,
      log.pricing_source ?? null,
      log.cached_read_tokens ?? 0,
      log.cached_write_tokens ?? 0,
      log.image_tokens ?? 0,
      log.audio_tokens ?? 0,
      log.reasoning_tokens ?? 0,
      log.image_count ?? 0,
      log.estimated_request_count ?? 0,
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
      is_estimated: log.is_estimated ?? false,
      estimation_source: log.estimation_source ?? null,
      pricing_source: log.pricing_source ?? null,
      cached_read_tokens: log.cached_read_tokens ?? 0,
      cached_write_tokens: log.cached_write_tokens ?? 0,
      image_tokens: log.image_tokens ?? 0,
      audio_tokens: log.audio_tokens ?? 0,
      reasoning_tokens: log.reasoning_tokens ?? 0,
      image_count: log.image_count ?? 0,
      estimated_request_count: log.estimated_request_count ?? 0,
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
        Number(existing.estimated_request_count) +
          (data.estimated_request_count ?? 0),
        Number(existing.cached_read_tokens) + (data.cached_read_tokens ?? 0),
        Number(existing.cached_write_tokens) + (data.cached_write_tokens ?? 0),
        Number(existing.image_tokens) + (data.image_tokens ?? 0),
        Number(existing.audio_tokens) + (data.audio_tokens ?? 0),
        Number(existing.reasoning_tokens) + (data.reasoning_tokens ?? 0),
        Number(existing.image_count) + (data.image_count ?? 0),
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
        data.estimated_request_count ?? 0,
        data.cached_read_tokens ?? 0,
        data.cached_write_tokens ?? 0,
        data.image_tokens ?? 0,
        data.audio_tokens ?? 0,
        data.reasoning_tokens ?? 0,
        data.image_count ?? 0,
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
        Number(existing.estimated_request_count) +
          (data.estimated_request_count ?? 0),
        Number(existing.cached_read_tokens) + (data.cached_read_tokens ?? 0),
        Number(existing.cached_write_tokens) + (data.cached_write_tokens ?? 0),
        Number(existing.image_tokens) + (data.image_tokens ?? 0),
        Number(existing.audio_tokens) + (data.audio_tokens ?? 0),
        Number(existing.reasoning_tokens) + (data.reasoning_tokens ?? 0),
        Number(existing.image_count) + (data.image_count ?? 0),
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
        data.estimated_request_count ?? 0,
        data.cached_read_tokens ?? 0,
        data.cached_write_tokens ?? 0,
        data.image_tokens ?? 0,
        data.audio_tokens ?? 0,
        data.reasoning_tokens ?? 0,
        data.image_count ?? 0,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Queries — PERIOD-AWARE
  // ---------------------------------------------------------------------------

  getUsageLogs(filters: UsageFilters): UsageLog[] {
    const providerIds = normalizeFilterValues(
      filters.providerIds ?? filters.providerId,
    );
    const modelIds = normalizeFilterValues(filters.modelIds ?? filters.modelId);

    if (providerIds.length > 0 || modelIds.length > 0) {
      const clauses: string[] = [];
      const params: Array<string | number> = [];

      if (providerIds.length > 0) {
        const clause = buildInClause(providerIds);
        clauses.push(`provider_id IN ${clause.sql}`);
        params.push(...clause.params);
      }

      if (modelIds.length > 0) {
        const clause = buildInClause(modelIds);
        clauses.push(`model_id IN ${clause.sql}`);
        params.push(...clause.params);
      }

      if (filters.startDate) {
        clauses.push("date(requested_at) >= ?");
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        clauses.push("date(requested_at) <= ?");
        params.push(filters.endDate);
      }

      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;
      const sql = `
        SELECT * FROM usage_logs
        ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY requested_at DESC
        LIMIT ? OFFSET ?
      `;

      return this.db.prepare(sql).all(...params, limit, offset) as UsageLog[];
    }

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

  getModelUsageTrend(modelId: string, days: number): DailyTrend[] {
    const start = format(subDays(new Date(), days), "yyyy-MM-dd");
    return this.db
      .prepare(
        `
        SELECT
          date,
          SUM(prompt_tokens) AS prompt_tokens,
          SUM(completion_tokens) AS completion_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(total_cost) AS total_cost,
          SUM(request_count) AS request_count
        FROM daily_summary
        WHERE model_id = ? AND date >= ?
        GROUP BY date
        ORDER BY date ASC
      `,
      )
      .all(modelId, start) as DailyTrend[];
  }

  ensureProviderAndModel(
    providerId: string,
    modelId: string,
    options?: {
      providerName?: string;
      providerBaseUrl?: string;
      modelName?: string;
      inputPricePerMillion?: number;
      outputPricePerMillion?: number;
      isLocal?: boolean;
    },
  ): void {
    const providerName = options?.providerName?.trim() || providerId;
    const providerBaseUrl =
      options?.providerBaseUrl?.trim() || "https://example.invalid";
    const modelName = options?.modelName?.trim() || modelId;

    this.stmts.ensureProvider.run(providerId, providerName, providerBaseUrl);
    this.stmts.ensureModel.run(
      modelId,
      providerId,
      modelName,
      options?.inputPricePerMillion ?? 0,
      options?.outputPricePerMillion ?? 0,
      options?.isLocal ? 1 : 0,
    );
  }

  deleteDailySummaryByDate(date: string): number {
    const result = this.stmts.deleteDailySummaryByDate.run(date);
    return result.changes;
  }

  deleteWeeklySummaryByWeekStart(weekStart: string): number {
    const result = this.stmts.deleteWeeklySummaryByWeekStart.run(weekStart);
    return result.changes;
  }

  // ---------------------------------------------------------------------------
  // Models with pricing
  // ---------------------------------------------------------------------------

  getAllModels(): Array<{
    id: string;
    provider_id: string;
    name: string;
    input_price_per_million: number;
    output_price_per_million: number;
    is_local: number;
    provider_name: string;
  }> {
    return this.db
      .prepare(
        `SELECT m.id, m.provider_id, m.name, m.input_price_per_million, m.output_price_per_million, m.is_local,
                p.name AS provider_name
         FROM models m
         JOIN providers p ON m.provider_id = p.id
         ORDER BY p.name, m.name`,
      )
      .all() as Array<{
      id: string;
      provider_id: string;
      name: string;
      input_price_per_million: number;
      output_price_per_million: number;
      is_local: number;
      provider_name: string;
    }>;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSetting(key: string): string | null {
    const row = this.stmts.getSetting.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  getSettingsMetadata(): SettingMetadata[] {
    return this.stmts.getSettingsMetadata.all() as SettingMetadata[];
  }

  setSetting(key: string, value: string): void {
    this.stmts.setSetting.run(key, value);
  }

  deleteSetting(key: string): number {
    const result = this.stmts.deleteSetting.run(key);
    return result.changes;
  }

  clearSettings(): number {
    const result = this.stmts.clearSettings.run();
    return result.changes;
  }

  // ---------------------------------------------------------------------------
  // API keys
  // ---------------------------------------------------------------------------

  getApiKeyMetadata(providerId: string): ApiKeyMetadata | null {
    const row = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;
    return rowToApiKeyMetadata(row);
  }

  getEncryptedApiKey(providerId: string): string | null {
    const row = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;
    return rowToApiKey(row)?.encrypted_key ?? null;
  }

  listApiKeyMetadata(): ProviderApiKeyMetadata[] {
    const rows = this.stmts.listApiKeyMetadata.all() as Array<
      Record<string, unknown>
    >;
    return rows
      .map((row) => rowToProviderApiKeyMetadata(row))
      .filter(
        (row): row is ProviderApiKeyMetadata =>
          row !== null && row.provider_id.length > 0,
      );
  }

  getProviderApiKeyMetadata(providerId: string): ProviderApiKeyMetadata | null {
    const row = this.stmts.getProviderApiKeyMetadata.get(providerId) as
      | Record<string, unknown>
      | undefined;
    return rowToProviderApiKeyMetadata(row);
  }

  setApiKey(providerId: string, encryptedKey: string): ApiKeyMetadata {
    const existing = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      this.stmts.setApiKeyUpdate.run(encryptedKey, existing.id);
    } else {
      this.stmts.setApiKeyInsert.run(uuidv4(), providerId, encryptedKey);
    }

    const updated = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;
    const metadata = rowToApiKeyMetadata(updated);
    if (!metadata) {
      throw new Error("Failed to persist API key metadata");
    }
    return metadata;
  }

  setApiKeyValidation(
    providerId: string,
    isValid: boolean,
    lastValidatedAt = new Date().toISOString(),
  ): ApiKeyMetadata | null {
    const existing = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      return null;
    }

    this.stmts.setApiKeyValidation.run(
      isValid ? 1 : 0,
      lastValidatedAt,
      existing.id,
    );

    const updated = this.stmts.getApiKeyByProvider.get(providerId) as
      | Record<string, unknown>
      | undefined;
    return rowToApiKeyMetadata(updated);
  }

  deleteApiKey(providerId: string): number {
    const result = this.stmts.deleteApiKeyByProvider.run(providerId);
    return result.changes;
  }

  clearApiKeys(): number {
    const result = this.stmts.clearApiKeys.run();
    return result.changes;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  clearUsageData(): ClearUsageDataResult {
    const clear = this.db.transaction(() => ({
      usage_logs: this.stmts.clearUsageLogs.run().changes,
      daily_summary: this.stmts.clearDailySummary.run().changes,
      weekly_summary: this.stmts.clearWeeklySummary.run().changes,
    }));
    return clear();
  }

  clearAllData(): ClearAllDataResult {
    const clear = this.db.transaction(() => ({
      usage_logs: this.stmts.clearUsageLogs.run().changes,
      daily_summary: this.stmts.clearDailySummary.run().changes,
      weekly_summary: this.stmts.clearWeeklySummary.run().changes,
      settings: this.stmts.clearSettings.run().changes,
      api_keys: this.stmts.clearApiKeys.run().changes,
    }));
    return clear();
  }

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
