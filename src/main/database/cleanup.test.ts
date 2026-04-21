import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations/index";
import { seedDatabase } from "./seed";
import { UsageRepository, createRepository } from "./repository";
import type { InsertUsageLogInput, UpsertSummaryInput } from "./types";
import { runCleanup, shouldRunCleanup, getRetentionDays } from "./cleanup";

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

describe("runCleanup", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  it("should delete usage logs older than retention days", () => {
    // Insert logs at different dates
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-01-01T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-02-01T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-19T10:00:00.000Z" }),
    );

    // 30-day retention should delete January and February logs
    const deletedCount = runCleanup(repo, 30);

    expect(deletedCount).toBe(2);

    // Verify remaining logs
    const remaining = repo.getUsageLogs({
      limit: 100,
      offset: 0,
    });
    expect(remaining.length).toBe(1);
    expect(remaining[0].requested_at).toContain("2026-04-19");
  });

  it("should NEVER delete from daily_summary", () => {
    // Insert daily summary
    repo.upsertDailySummary(
      "2026-01-01",
      "openai",
      "gpt-4o",
      makeSummaryInput(),
    );

    // Insert usage log that will be cleaned up
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-01-01T10:00:00.000Z" }),
    );

    // Run cleanup with very short retention
    runCleanup(repo, 1);

    // Daily summary should still exist
    const dailySummaries = repo.getDailySummary({
      start: "2026-01-01",
      end: "2026-01-01",
    });
    expect(dailySummaries.length).toBe(1);
  });

  it("should NEVER delete from weekly_summary", () => {
    // Insert weekly summary
    repo.upsertWeeklySummary(
      "2025-12-29",
      "openai",
      "gpt-4o",
      makeSummaryInput(),
    );

    // Insert usage log that will be cleaned up
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2025-12-30T10:00:00.000Z" }),
    );

    // Run cleanup with very short retention
    runCleanup(repo, 1);

    // Weekly summary should still exist
    const weeklySummaries = repo.getWeeklySummary({
      start: "2025-12-29",
      end: "2025-12-29",
    });
    expect(weeklySummaries.length).toBe(1);
  });

  it("should return correct deleted count", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-01-01T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-01-02T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-01-03T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-19T10:00:00.000Z" }),
    );

    const deletedCount = runCleanup(repo, 7);

    expect(deletedCount).toBe(3);
  });

  it("should delete nothing with retention of 0", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2020-01-01T10:00:00.000Z" }),
    );

    const deletedCount = runCleanup(repo, 0);

    expect(deletedCount).toBe(0);

    const logs = repo.getUsageLogs({ limit: 100, offset: 0 });
    expect(logs.length).toBe(1);
  });

  it("should handle very large retention (nothing deleted)", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-19T10:00:00.000Z" }),
    );

    const deletedCount = runCleanup(repo, 36500); // 100 years

    expect(deletedCount).toBe(0);

    const logs = repo.getUsageLogs({ limit: 100, offset: 0 });
    expect(logs.length).toBe(1);
  });
});

describe("shouldRunCleanup", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  it("should default to true when no setting is configured", () => {
    expect(shouldRunCleanup(repo)).toBe(true);
  });

  it("should return true when setting is 'true'", () => {
    repo.setSetting("data_retention_auto_cleanup", "true");
    expect(shouldRunCleanup(repo)).toBe(true);
  });

  it("should return true when setting is '1'", () => {
    repo.setSetting("data_retention_auto_cleanup", "1");
    expect(shouldRunCleanup(repo)).toBe(true);
  });

  it("should return false when setting is 'false'", () => {
    repo.setSetting("data_retention_auto_cleanup", "false");
    expect(shouldRunCleanup(repo)).toBe(false);
  });
});

describe("getRetentionDays", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  it("should default to 90 when no setting is configured", () => {
    expect(getRetentionDays(repo)).toBe(90);
  });

  it("should return configured value", () => {
    repo.setSetting("data_retention_days", "30");
    expect(getRetentionDays(repo)).toBe(30);
  });

  it("should default to 90 for invalid values", () => {
    repo.setSetting("data_retention_days", "not-a-number");
    expect(getRetentionDays(repo)).toBe(90);
  });

  it("should default to 90 for negative values", () => {
    repo.setSetting("data_retention_days", "-5");
    expect(getRetentionDays(repo)).toBe(90);
  });
});
