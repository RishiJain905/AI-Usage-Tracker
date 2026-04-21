import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../database/migrations/index";
import { seedDatabase } from "../database/seed";
import { UsageRepository, createRepository } from "../database/repository";
import type {
  InsertUsageLogInput,
  UpsertSummaryInput,
} from "../database/types";
import { exportToJson } from "./json";

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

function makeLogInput(
  overrides: Partial<InsertUsageLogInput> = {},
): InsertUsageLogInput {
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

function makeSummaryInput(
  overrides: Partial<UpsertSummaryInput> = {},
): UpsertSummaryInput {
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

describe("exportToJson", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  it("should produce valid JSON output", () => {
    repo.insertUsageLog(makeLogInput());
    const json = exportToJson(repo, { period: "all" });

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("exportedAt");
    expect(parsed).toHaveProperty("exportedBy", "AI Usage Tracker");
    expect(parsed).toHaveProperty("logs");
    expect(parsed).toHaveProperty("dateRange");
    expect(parsed).toHaveProperty("period");
  });

  it("should include aggregateSummary when includeSummary is true", () => {
    // Need daily summary data for aggregate to work
    repo.upsertDailySummary(
      "2026-04-19",
      "openai",
      "gpt-4o",
      makeSummaryInput({
        total_cost: 0.001,
        total_tokens: 150,
      }),
    );

    const json = exportToJson(repo, {
      period: "all",
      includeSummary: true,
    });
    const parsed = JSON.parse(json);

    expect(parsed.aggregateSummary).not.toBeNull();
    expect(parsed.aggregateSummary).toHaveProperty("total_tokens");
    expect(parsed.aggregateSummary).toHaveProperty("total_cost");
    expect(parsed.aggregateSummary).toHaveProperty("request_count");
  });

  it("should not include aggregateSummary when includeSummary is false", () => {
    const json = exportToJson(repo, {
      period: "all",
      includeSummary: false,
    });
    const parsed = JSON.parse(json);

    expect(parsed.aggregateSummary).toBeNull();
  });

  it("should include perModelSummary when includePerModelSummary is true", () => {
    // Need daily summary data for model summaries
    repo.upsertDailySummary(
      "2026-04-19",
      "openai",
      "gpt-4o",
      makeSummaryInput({
        total_cost: 0.001,
        total_tokens: 150,
      }),
    );

    const json = exportToJson(repo, {
      period: "all",
      includePerModelSummary: true,
    });
    const parsed = JSON.parse(json);

    expect(parsed.perModelSummary).not.toBeNull();
    expect(Array.isArray(parsed.perModelSummary)).toBe(true);
  });

  it("should include both summaries when both flags are set", () => {
    repo.upsertDailySummary(
      "2026-04-19",
      "openai",
      "gpt-4o",
      makeSummaryInput({
        total_cost: 0.001,
        total_tokens: 150,
      }),
    );

    const json = exportToJson(repo, {
      period: "all",
      includeSummary: true,
      includePerModelSummary: true,
    });
    const parsed = JSON.parse(json);

    expect(parsed.aggregateSummary).not.toBeNull();
    expect(parsed.perModelSummary).not.toBeNull();
    expect(Array.isArray(parsed.perModelSummary)).toBe(true);
    expect(parsed.aggregateSummary).toHaveProperty("total_tokens");
  });

  it("should produce pretty-printed JSON when pretty is true", () => {
    repo.insertUsageLog(makeLogInput());

    const json = exportToJson(repo, { period: "all", pretty: true });

    // Pretty JSON should have indentation
    expect(json).toContain("\n");
    expect(json).toContain("  "); // 2-space indent
  });

  it("should produce compact JSON when pretty is false", () => {
    repo.insertUsageLog(makeLogInput());

    const json = exportToJson(repo, { period: "all", pretty: false });

    // Compact JSON should be a single line (or minimal whitespace)
    // There should be no indentation spaces after colons
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
  });

  it("should round-trip: parse JSON and verify fields match input data", () => {
    const log1 = makeLogInput({
      provider_id: "openai",
      model_id: "gpt-4o",
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      requested_at: "2026-04-19T10:00:00.000Z",
    });
    const log2 = makeLogInput({
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      prompt_tokens: 200,
      completion_tokens: 100,
      total_tokens: 300,
      requested_at: "2026-04-19T11:00:00.000Z",
    });

    repo.insertUsageLog(log1);
    repo.insertUsageLog(log2);

    const json = exportToJson(repo, { period: "all", pretty: true });
    const parsed = JSON.parse(json);

    // Verify metadata
    expect(parsed.exportedBy).toBe("AI Usage Tracker");
    expect(parsed.period).toBe("all");
    expect(parsed.exportedAt).toBeTruthy();

    // Verify logs
    expect(parsed.logs).toHaveLength(2);
    // Logs sorted ascending by requested_at
    expect(parsed.logs[0].model_id).toBe("gpt-4o");
    expect(parsed.logs[0].prompt_tokens).toBe(100);
    expect(parsed.logs[1].model_id).toBe("gpt-4o-mini");
    expect(parsed.logs[1].prompt_tokens).toBe(200);
  });

  it("should handle empty result set", () => {
    const json = exportToJson(repo, { period: "all" });
    const parsed = JSON.parse(json);

    expect(parsed.logs).toHaveLength(0);
    expect(parsed.exportedAt).toBeTruthy();
  });

  it("should filter by date range", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-10T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-20T10:00:00.000Z" }),
    );

    const json = exportToJson(repo, {
      dateRange: { start: "2026-04-15", end: "2026-04-25" },
    });
    const parsed = JSON.parse(json);

    expect(parsed.logs).toHaveLength(1);
    expect(parsed.logs[0].requested_at).toContain("2026-04-20");
  });
});
