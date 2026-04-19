import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { format, startOfWeek, subDays, subWeeks } from "date-fns";
import { runMigrations } from "./migrations/index";
import { seedDatabase } from "./seed";
import {
  UsageRepository,
  getPeriodDates,
  createRepository,
} from "./repository";
import type { InsertUsageLogInput, UpsertSummaryInput } from "./types";

// ---------------------------------------------------------------------------
// Helper: fresh in-memory DB with migrations + seed data
// ---------------------------------------------------------------------------

function createTestDb(): { db: Database.Database; repo: UsageRepository } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
  runMigrations(db);
  seedDatabase(db);
  const repo = createRepository(db);
  return { db, repo };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal InsertUsageLogInput
// ---------------------------------------------------------------------------

function makeLogInput(overrides: Partial<InsertUsageLogInput> = {}): InsertUsageLogInput {
  return {
    provider_id: "openai",
    model_id: "gpt-4o",
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    input_cost: 0.00025,
    output_cost: 0.0005,
    total_cost: 0.00075,
    request_duration_ms: 500,
    is_streaming: false,
    is_error: false,
    requested_at: "2026-04-19T10:00:00.000Z",
    ...overrides,
  };
}

function makeSummaryInput(overrides: Partial<UpsertSummaryInput> = {}): UpsertSummaryInput {
  return {
    request_count: 1,
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    input_cost: 0.00025,
    output_cost: 0.0005,
    total_cost: 0.00075,
    error_count: 0,
    avg_duration_ms: 500,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("getPeriodDates", () => {
  it("should return correct range for 'all'", () => {
    const { start, end } = getPeriodDates("all");
    expect(start).toBe("0001-01-01");
    expect(end).toBe("9999-12-31");
  });

  it("should return same start and end for 'today'", () => {
    const { start, end } = getPeriodDates("today");
    const today = format(new Date(), "yyyy-MM-dd");
    expect(start).toBe(today);
    expect(end).toBe(today);
  });

  it("should return week range for 'week'", () => {
    const { start, end } = getPeriodDates("week");
    const now = new Date();
    const expectedStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    expect(start).toBe(expectedStart);
    // End should be >= start
    expect(end >= start).toBe(true);
  });
});

describe("UsageRepository", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // createRepository factory
  // -------------------------------------------------------------------------

  describe("createRepository", () => {
    it("should return a UsageRepository instance", () => {
      expect(repo).toBeInstanceOf(UsageRepository);
    });
  });

  // -------------------------------------------------------------------------
  // insertUsageLog
  // -------------------------------------------------------------------------

  describe("insertUsageLog", () => {
    it("should insert a usage log and return it with a generated id", () => {
      const input = makeLogInput();
      const result = repo.insertUsageLog(input);

      expect(result.id).toBeDefined();
      expect(result.provider_id).toBe("openai");
      expect(result.model_id).toBe("gpt-4o");
      expect(result.prompt_tokens).toBe(100);
      expect(result.completion_tokens).toBe(50);
      expect(result.total_tokens).toBe(150);
      expect(result.input_cost).toBe(0.00025);
      expect(result.output_cost).toBe(0.0005);
      expect(result.total_cost).toBe(0.00075);
      expect(result.request_duration_ms).toBe(500);
      expect(result.is_streaming).toBe(false);
      expect(result.is_error).toBe(false);
      expect(result.created_at).toBeDefined();
    });

    it("should store the log in the database", () => {
      const input = makeLogInput();
      const result = repo.insertUsageLog(input);

      const row = db
        .prepare("SELECT * FROM usage_logs WHERE id = ?")
        .get(result.id) as any;

      expect(row).toBeDefined();
      expect(row.provider_id).toBe("openai");
      expect(row.prompt_tokens).toBe(100);
    });

    it("should handle optional fields (endpoint, tags, app_name)", () => {
      const input = makeLogInput({
        endpoint: "/v1/chat/completions",
        tags: "test,integration",
        app_name: "test-app",
      });
      const result = repo.insertUsageLog(input);

      expect(result.endpoint).toBe("/v1/chat/completions");
      expect(result.tags).toBe("test,integration");
      expect(result.app_name).toBe("test-app");

      const row = db
        .prepare("SELECT * FROM usage_logs WHERE id = ?")
        .get(result.id) as any;
      expect(row.endpoint).toBe("/v1/chat/completions");
      expect(row.tags).toBe("test,integration");
      expect(row.app_name).toBe("test-app");
    });

    it("should default method to POST when not specified", () => {
      const input = makeLogInput({ method: undefined });
      const result = repo.insertUsageLog(input);
      expect(result.method).toBe("POST");
    });

    it("should default source to 'proxy' when not specified", () => {
      const input = makeLogInput({ source: undefined });
      const result = repo.insertUsageLog(input);
      expect(result.source).toBe("proxy");
    });

    it("should store error information", () => {
      const input = makeLogInput({
        is_error: true,
        error_message: "Rate limit exceeded",
      });
      const result = repo.insertUsageLog(input);

      expect(result.is_error).toBe(true);
      expect(result.error_message).toBe("Rate limit exceeded");
    });
  });

  // -------------------------------------------------------------------------
  // upsertDailySummary
  // -------------------------------------------------------------------------

  describe("upsertDailySummary", () => {
    it("should insert a new daily summary entry", () => {
      const data = makeSummaryInput();
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data);

      const row = db
        .prepare("SELECT * FROM daily_summary WHERE date = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-19", "openai", "gpt-4o") as any;

      expect(row).toBeDefined();
      expect(row.request_count).toBe(1);
      expect(row.prompt_tokens).toBe(100);
      expect(row.completion_tokens).toBe(50);
      expect(row.total_tokens).toBe(150);
      expect(row.total_cost).toBe(0.00075);
    });

    it("should update (add values) on upsert — not replace", () => {
      const data1 = makeSummaryInput({ request_count: 3, total_tokens: 300, total_cost: 1.0 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data1);

      const data2 = makeSummaryInput({ request_count: 2, total_tokens: 200, total_cost: 0.5 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data2);

      const row = db
        .prepare("SELECT * FROM daily_summary WHERE date = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-19", "openai", "gpt-4o") as any;

      expect(row.request_count).toBe(5); // 3 + 2
      expect(row.total_tokens).toBe(500); // 300 + 200
      expect(row.total_cost).toBe(1.5); // 1.0 + 0.5
    });

    it("should recalculate avg_duration_ms as weighted average on upsert", () => {
      const data1 = makeSummaryInput({ request_count: 4, avg_duration_ms: 100 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data1);

      const data2 = makeSummaryInput({ request_count: 1, avg_duration_ms: 200 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data2);

      const row = db
        .prepare("SELECT avg_duration_ms FROM daily_summary WHERE date = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-19", "openai", "gpt-4o") as { avg_duration_ms: number };

      // Weighted avg: (100*4 + 200*1) / 5 = 120
      expect(row.avg_duration_ms).toBeCloseTo(120, 2);
    });

    it("should add error_count on upsert", () => {
      const data1 = makeSummaryInput({ error_count: 2 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data1);

      const data2 = makeSummaryInput({ error_count: 3 });
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", data2);

      const row = db
        .prepare("SELECT error_count FROM daily_summary WHERE date = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-19", "openai", "gpt-4o") as { error_count: number };

      expect(row.error_count).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // upsertWeeklySummary
  // -------------------------------------------------------------------------

  describe("upsertWeeklySummary", () => {
    it("should insert a new weekly summary entry", () => {
      const data = makeSummaryInput();
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", data);

      const row = db
        .prepare("SELECT * FROM weekly_summary WHERE week_start = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-13", "openai", "gpt-4o") as any;

      expect(row).toBeDefined();
      expect(row.request_count).toBe(1);
      expect(row.total_tokens).toBe(150);
    });

    it("should update (add values) on upsert", () => {
      const data1 = makeSummaryInput({ request_count: 5, total_tokens: 500, total_cost: 2.0 });
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", data1);

      const data2 = makeSummaryInput({ request_count: 3, total_tokens: 300, total_cost: 1.0 });
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", data2);

      const row = db
        .prepare("SELECT * FROM weekly_summary WHERE week_start = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-13", "openai", "gpt-4o") as any;

      expect(row.request_count).toBe(8);
      expect(row.total_tokens).toBe(800);
      expect(row.total_cost).toBe(3.0);
    });

    it("should recalculate avg_duration_ms as weighted average on upsert", () => {
      const data1 = makeSummaryInput({ request_count: 2, avg_duration_ms: 300 });
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", data1);

      const data2 = makeSummaryInput({ request_count: 3, avg_duration_ms: 500 });
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", data2);

      const row = db
        .prepare("SELECT avg_duration_ms FROM weekly_summary WHERE week_start = ? AND provider_id = ? AND model_id = ?")
        .get("2026-04-13", "openai", "gpt-4o") as { avg_duration_ms: number };

      // (300*2 + 500*3) / 5 = 420
      expect(row.avg_duration_ms).toBeCloseTo(420, 2);
    });
  });

  // -------------------------------------------------------------------------
  // getUsageLogs
  // -------------------------------------------------------------------------

  describe("getUsageLogs", () => {
    beforeEach(() => {
      repo.insertUsageLog(makeLogInput({
        provider_id: "openai",
        model_id: "gpt-4o",
        requested_at: "2026-04-19T10:00:00.000Z",
      }));
      repo.insertUsageLog(makeLogInput({
        provider_id: "anthropic",
        model_id: "claude-3.5-sonnet",
        requested_at: "2026-04-18T10:00:00.000Z",
      }));
      repo.insertUsageLog(makeLogInput({
        provider_id: "openai",
        model_id: "gpt-4o-mini",
        requested_at: "2026-04-17T10:00:00.000Z",
      }));
    });

    it("should return all logs when no filters", () => {
      const logs = repo.getUsageLogs({});
      expect(logs).toHaveLength(3);
    });

    it("should filter by providerId", () => {
      const logs = repo.getUsageLogs({ providerId: "openai" });
      expect(logs).toHaveLength(2);
      expect(logs.every((l) => l.provider_id === "openai")).toBe(true);
    });

    it("should filter by modelId", () => {
      const logs = repo.getUsageLogs({ modelId: "gpt-4o" });
      expect(logs).toHaveLength(1);
      expect(logs[0].model_id).toBe("gpt-4o");
    });

    it("should filter by date range", () => {
      const logs = repo.getUsageLogs({
        startDate: "2026-04-18",
        endDate: "2026-04-19",
      });
      expect(logs).toHaveLength(2);
    });

    it("should respect limit", () => {
      const logs = repo.getUsageLogs({ limit: 2 });
      expect(logs).toHaveLength(2);
    });

    it("should respect offset", () => {
      const logs = repo.getUsageLogs({ limit: 1, offset: 1 });
      expect(logs).toHaveLength(1);
    });

    it("should return results ordered by requested_at DESC", () => {
      const logs = repo.getUsageLogs({});
      expect(logs[0].requested_at).toBe("2026-04-19T10:00:00.000Z");
      expect(logs[2].requested_at).toBe("2026-04-17T10:00:00.000Z");
    });
  });

  // -------------------------------------------------------------------------
  // getUsageSummary
  // -------------------------------------------------------------------------

  describe("getUsageSummary", () => {
    it("should return zeros for period with no data", () => {
      const summary = repo.getUsageSummary("today");
      expect(summary.total_requests).toBe(0);
      expect(summary.total_tokens).toBe(0);
      expect(summary.total_cost).toBe(0);
      expect(summary.unique_models).toBe(0);
      expect(summary.unique_providers).toBe(0);
    });

    it("should return correct summary for a period with data", () => {
      const today = format(new Date(), "yyyy-MM-dd");

      // Insert daily summaries for today
      repo.upsertDailySummary(today, "openai", "gpt-4o", makeSummaryInput({
        request_count: 5,
        total_tokens: 500,
        total_cost: 1.5,
      }));
      repo.upsertDailySummary(today, "anthropic", "claude-3.5-sonnet", makeSummaryInput({
        request_count: 3,
        total_tokens: 300,
        total_cost: 2.0,
      }));

      const summary = repo.getUsageSummary("today");

      expect(summary.total_requests).toBe(8);
      expect(summary.total_tokens).toBe(800);
      expect(summary.total_cost).toBe(3.5);
      expect(summary.unique_models).toBe(2);
      expect(summary.unique_providers).toBe(2);
      expect(summary.period).toBe("today");
    });

    it("should work with 'all' period", () => {
      repo.upsertDailySummary("2026-01-01", "openai", "gpt-4o", makeSummaryInput({
        request_count: 10,
        total_tokens: 1000,
        total_cost: 5.0,
      }));

      const summary = repo.getUsageSummary("all");
      expect(summary.total_requests).toBe(10);
      expect(summary.total_tokens).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // getAggregateTotal / getAggregateDailyTotal / etc.
  // -------------------------------------------------------------------------

  describe("getAggregateTotal", () => {
    it("should return empty aggregate for period with no data", () => {
      const total = repo.getAggregateTotal("today");
      expect(total.prompt_tokens).toBe(0);
      expect(total.total_tokens).toBe(0);
      expect(total.total_cost).toBe(0);
      expect(total.request_count).toBe(0);
    });

    it("should sum across multiple providers and models", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        input_cost: 0.25,
        output_cost: 0.5,
        total_cost: 0.75,
        request_count: 5,
      }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
        input_cost: 0.6,
        output_cost: 1.5,
        total_cost: 2.1,
        request_count: 3,
      }));

      const total = repo.getAggregateTotal("all");
      expect(total.prompt_tokens).toBe(300);
      expect(total.completion_tokens).toBe(150);
      expect(total.total_tokens).toBe(450);
      expect(total.input_cost).toBe(0.85);
      expect(total.output_cost).toBe(2.0);
      expect(total.total_cost).toBeCloseTo(2.85, 4);
      expect(total.request_count).toBe(8);
    });
  });

  describe("getAggregateDailyTotal", () => {
    it("should return aggregate for a specific date", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 100,
        request_count: 2,
      }));

      const total = repo.getAggregateDailyTotal("2026-04-19");
      expect(total.total_tokens).toBe(100);
      expect(total.request_count).toBe(2);
    });

    it("should return zeros for date with no data", () => {
      const total = repo.getAggregateDailyTotal("2020-01-01");
      expect(total.total_tokens).toBe(0);
    });
  });

  describe("getAggregateWeeklyTotal", () => {
    it("should return aggregate for a specific week", () => {
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 500,
        request_count: 10,
      }));

      const total = repo.getAggregateWeeklyTotal("2026-04-13");
      expect(total.total_tokens).toBe(500);
      expect(total.request_count).toBe(10);
    });
  });

  describe("getAggregateAllTimeTotal", () => {
    it("should sum all daily summaries", () => {
      repo.upsertDailySummary("2026-01-01", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 200,
        request_count: 4,
      }));
      repo.upsertDailySummary("2026-03-15", "anthropic", "claude-3.5-sonnet", makeSummaryInput({
        total_tokens: 300,
        request_count: 6,
      }));

      const total = repo.getAggregateAllTimeTotal();
      expect(total.total_tokens).toBe(500);
      expect(total.request_count).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // getModelBreakdownForPeriod
  // -------------------------------------------------------------------------

  describe("getModelBreakdownForPeriod", () => {
    it("should return per-model breakdown for a period", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 500,
        total_cost: 1.0,
        request_count: 5,
      }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({
        total_tokens: 300,
        total_cost: 2.0,
        request_count: 3,
      }));

      const breakdown = repo.getModelBreakdownForPeriod("all");

      expect(breakdown).toHaveLength(2);
      // Should be ordered by total_tokens DESC
      expect(breakdown[0].model_id).toBe("gpt-4o");
      expect(breakdown[0].total_tokens).toBe(500);
      expect(breakdown[0].provider_name).toBe("OpenAI");

      expect(breakdown[1].model_id).toBe("claude-3.5-sonnet");
      expect(breakdown[1].provider_name).toBe("Anthropic");
    });

    it("should return empty array for period with no data", () => {
      const breakdown = repo.getModelBreakdownForPeriod("today");
      expect(breakdown).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAllModelSummaries
  // -------------------------------------------------------------------------

  describe("getAllModelSummaries", () => {
    it("should return summaries for all models in a period", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 400,
        request_count: 4,
      }));
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o-mini", makeSummaryInput({
        total_tokens: 100,
        request_count: 1,
      }));

      const summaries = repo.getAllModelSummaries("all");

      expect(summaries).toHaveLength(2);
      // Ordered by total_tokens DESC
      expect(summaries[0].total_tokens).toBe(400);
      expect(summaries[1].total_tokens).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // getTopModels
  // -------------------------------------------------------------------------

  describe("getTopModels", () => {
    beforeEach(() => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 1000,
        total_cost: 5.0,
        request_count: 10,
      }));
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o-mini", makeSummaryInput({
        total_tokens: 800,
        total_cost: 1.0,
        request_count: 8,
      }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({
        total_tokens: 600,
        total_cost: 3.0,
        request_count: 6,
      }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3-opus", makeSummaryInput({
        total_tokens: 400,
        total_cost: 10.0,
        request_count: 4,
      }));
      repo.upsertDailySummary("2026-04-19", "gemini", "gemini-1.5-pro", makeSummaryInput({
        total_tokens: 200,
        total_cost: 0.5,
        request_count: 2,
      }));
    });

    it("should return top N models by total_tokens in descending order", () => {
      const top3 = repo.getTopModels(3, "all");

      expect(top3).toHaveLength(3);
      expect(top3[0].model_id).toBe("gpt-4o");
      expect(top3[0].total_tokens).toBe(1000);
      expect(top3[1].model_id).toBe("gpt-4o-mini");
      expect(top3[2].model_id).toBe("claude-3.5-sonnet");
    });

    it("should return fewer results if limit exceeds available models", () => {
      const top10 = repo.getTopModels(10, "all");
      expect(top10).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // getUsageTrend
  // -------------------------------------------------------------------------

  describe("getUsageTrend", () => {
    it("should return daily totals for the past N days", () => {
      const today = new Date();
      const dates = Array.from({ length: 7 }, (_, i) =>
        format(subDays(today, 6 - i), "yyyy-MM-dd"),
      );

      // Insert daily summaries for past 7 days
      for (let i = 0; i < 7; i++) {
        repo.upsertDailySummary(dates[i], "openai", "gpt-4o", makeSummaryInput({
          total_tokens: 100 * (i + 1),
          request_count: i + 1,
        }));
      }

      const trend = repo.getUsageTrend(7);

      expect(trend).toHaveLength(7);
      expect(trend[0].date).toBe(dates[0]);
      expect(trend[6].date).toBe(dates[6]);
      // Should be in ascending date order
      expect(trend[6].total_tokens).toBe(700);
    });
  });

  // -------------------------------------------------------------------------
  // getWeeklyTrend
  // -------------------------------------------------------------------------

  describe("getWeeklyTrend", () => {
    it("should return weekly totals for the past N weeks", () => {
      const weekStarts = Array.from({ length: 3 }, (_, i) =>
        format(
          startOfWeek(subWeeks(new Date(), 2 - i), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        ),
      );

      for (let i = 0; i < 3; i++) {
        repo.upsertWeeklySummary(weekStarts[i], "openai", "gpt-4o", makeSummaryInput({
          total_tokens: 1000 * (i + 1),
          request_count: 10 * (i + 1),
        }));
      }

      const trend = repo.getWeeklyTrend(3);

      expect(trend).toHaveLength(3);
      expect(trend[0].week_start).toBe(weekStarts[0]);
      // Ascending order
      expect(trend[2].total_tokens).toBe(3000);
    });
  });

  // -------------------------------------------------------------------------
  // getTotalTokensByProvider / getTotalCostByProvider
  // -------------------------------------------------------------------------

  describe("getTotalTokensByProvider", () => {
    it("should return total tokens grouped by provider", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({ total_tokens: 500 }));
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o-mini", makeSummaryInput({ total_tokens: 300 }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({ total_tokens: 400 }));

      const result = repo.getTotalTokensByProvider("all");

      expect(result["openai"]).toBe(800);
      expect(result["anthropic"]).toBe(400);
    });
  });

  describe("getTotalCostByProvider", () => {
    it("should return total cost grouped by provider", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({ total_cost: 1.5 }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({ total_cost: 3.0 }));

      const result = repo.getTotalCostByProvider("all");

      expect(result["openai"]).toBe(1.5);
      expect(result["anthropic"]).toBe(3.0);
    });
  });

  // -------------------------------------------------------------------------
  // getTotalTokensByModel / getTotalCostByModel
  // -------------------------------------------------------------------------

  describe("getTotalTokensByModel", () => {
    it("should return total tokens grouped by model", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({ total_tokens: 500 }));
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o-mini", makeSummaryInput({ total_tokens: 200 }));

      const result = repo.getTotalTokensByModel("all");

      expect(result["gpt-4o"]).toBe(500);
      expect(result["gpt-4o-mini"]).toBe(200);
    });
  });

  describe("getTotalCostByModel", () => {
    it("should return total cost grouped by model", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({ total_cost: 2.5 }));
      repo.upsertDailySummary("2026-04-19", "anthropic", "claude-3.5-sonnet", makeSummaryInput({ total_cost: 4.0 }));

      const result = repo.getTotalCostByModel("all");

      expect(result["gpt-4o"]).toBe(2.5);
      expect(result["claude-3.5-sonnet"]).toBe(4.0);
    });
  });

  // -------------------------------------------------------------------------
  // getProviderSummary
  // -------------------------------------------------------------------------

  describe("getProviderSummary", () => {
    it("should return provider summary with correct aggregations", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        total_tokens: 500,
        total_cost: 1.5,
        request_count: 5,
      }));
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o-mini", makeSummaryInput({
        total_tokens: 200,
        total_cost: 0.5,
        request_count: 2,
      }));

      const summary = repo.getProviderSummary("openai", "all");

      expect(summary.provider_id).toBe("openai");
      expect(summary.provider_name).toBe("OpenAI");
      expect(summary.total_tokens).toBe(700);
      expect(summary.total_cost).toBe(2.0);
      expect(summary.request_count).toBe(7);
      expect(summary.model_count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getModelSummary
  // -------------------------------------------------------------------------

  describe("getModelSummary", () => {
    it("should return model summary with correct data", () => {
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost: 0.75,
        request_count: 3,
      }));

      const summary = repo.getModelSummary("gpt-4o", "all");

      expect(summary.model_id).toBe("gpt-4o");
      expect(summary.model_name).toBe("GPT-4o");
      expect(summary.provider_name).toBe("OpenAI");
      expect(summary.total_tokens).toBe(150);
      expect(summary.request_count).toBe(3);
    });

    it("should return empty values for non-existent model", () => {
      const summary = repo.getModelSummary("nonexistent", "all");
      expect(summary.model_id).toBe("nonexistent");
      expect(summary.total_tokens).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getDailySummary / getWeeklySummary
  // -------------------------------------------------------------------------

  describe("getDailySummary", () => {
    it("should return daily summaries within date range", () => {
      repo.upsertDailySummary("2026-04-17", "openai", "gpt-4o", makeSummaryInput());
      repo.upsertDailySummary("2026-04-18", "openai", "gpt-4o", makeSummaryInput());
      repo.upsertDailySummary("2026-04-19", "openai", "gpt-4o", makeSummaryInput());

      const result = repo.getDailySummary({ start: "2026-04-18", end: "2026-04-19" });
      expect(result).toHaveLength(2);
    });
  });

  describe("getWeeklySummary", () => {
    it("should return weekly summaries within date range", () => {
      repo.upsertWeeklySummary("2026-04-06", "openai", "gpt-4o", makeSummaryInput());
      repo.upsertWeeklySummary("2026-04-13", "openai", "gpt-4o", makeSummaryInput());

      const result = repo.getWeeklySummary({ start: "2026-04-13", end: "2026-04-13" });
      expect(result).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  describe("getSetting", () => {
    it("should return null for non-existent key", () => {
      const val = repo.getSetting("nonexistent");
      expect(val).toBeNull();
    });
  });

  describe("setSetting", () => {
    it("should store and retrieve a setting", () => {
      repo.setSetting("theme", "dark");
      const val = repo.getSetting("theme");
      expect(val).toBe("dark");
    });

    it("should update existing value (INSERT OR REPLACE)", () => {
      repo.setSetting("theme", "dark");
      repo.setSetting("theme", "light");

      const val = repo.getSetting("theme");
      expect(val).toBe("light");
    });

    it("should handle multiple settings independently", () => {
      repo.setSetting("key1", "value1");
      repo.setSetting("key2", "value2");

      expect(repo.getSetting("key1")).toBe("value1");
      expect(repo.getSetting("key2")).toBe("value2");
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("deleteUsageBefore", () => {
    it("should delete logs before the given date and return count", () => {
      repo.insertUsageLog(makeLogInput({ requested_at: "2026-01-01T10:00:00.000Z" }));
      repo.insertUsageLog(makeLogInput({ requested_at: "2026-01-15T10:00:00.000Z" }));
      repo.insertUsageLog(makeLogInput({ requested_at: "2026-04-19T10:00:00.000Z" }));

      const deleted = repo.deleteUsageBefore("2026-02-01");
      expect(deleted).toBe(2);

      const remaining = repo.getUsageLogs({});
      expect(remaining).toHaveLength(1);
    });

    it("should return 0 when no logs match", () => {
      const deleted = repo.deleteUsageBefore("2020-01-01");
      expect(deleted).toBe(0);
    });
  });

  describe("vacuum", () => {
    it("should run without error", () => {
      expect(() => repo.vacuum()).not.toThrow();
    });
  });
});
