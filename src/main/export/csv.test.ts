import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../database/migrations/index";
import { seedDatabase } from "../database/seed";
import { UsageRepository, createRepository } from "../database/repository";
import type { InsertUsageLogInput } from "../database/types";
import { exportToCsv } from "./csv";

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

// ===========================================================================
// Tests
// ===========================================================================

describe("exportToCsv", () => {
  let db: Database.Database;
  let repo: UsageRepository;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
  });

  afterEach(() => {
    db.close();
  });

  it("should include correct headers by default", () => {
    const csv = exportToCsv(repo, { period: "all" });
    const lines = csv.split("\n");
    const headers = lines[0];
    expect(headers).toBe(
      "Date,Time,Provider,Model,Prompt Tokens,Completion Tokens,Total Tokens,Input Cost,Output Cost,Total Cost,Duration (ms),Streaming,Endpoint",
    );
  });

  it("should omit headers when includeHeaders is false", () => {
    repo.insertUsageLog(makeLogInput());
    const csv = exportToCsv(repo, { period: "all", includeHeaders: false });
    const lines = csv.split("\n");
    // First line should be data, not header
    expect(lines[0]).not.toContain("Date");
    expect(lines[0]).toContain("openai");
  });

  it("should output a TOTAL row with includeAggregateRow", () => {
    repo.insertUsageLog(
      makeLogInput({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        input_cost: 0.01,
        output_cost: 0.02,
        total_cost: 0.03,
        request_duration_ms: 500,
        requested_at: "2026-04-19T10:00:00.000Z",
      }),
    );
    repo.insertUsageLog(
      makeLogInput({
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
        input_cost: 0.04,
        output_cost: 0.05,
        total_cost: 0.09,
        request_duration_ms: 600,
        requested_at: "2026-04-19T11:00:00.000Z",
      }),
    );

    const csv = exportToCsv(repo, {
      period: "all",
      includeAggregateRow: true,
    });
    const lines = csv.split("\n");

    // Last non-empty line should be the TOTAL row
    const totalLine = lines[lines.length - 1];
    expect(totalLine).toContain("TOTAL");
    expect(totalLine).toContain("300"); // prompt_tokens sum: 100+200
    expect(totalLine).toContain("150"); // completion_tokens sum: 50+100
    expect(totalLine).toContain("450"); // total_tokens sum: 150+300
    expect(totalLine).toContain("0.05"); // input_cost sum
    expect(totalLine).toContain("0.07"); // output_cost sum
    expect(totalLine).toContain("0.12"); // total_cost sum
    expect(totalLine).toContain("1100"); // duration sum: 500+600
  });

  it("should group by model and add subtotals with groupByModel", () => {
    repo.insertUsageLog(
      makeLogInput({
        model_id: "gpt-4o",
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost: 0.03,
        requested_at: "2026-04-19T10:00:00.000Z",
      }),
    );
    repo.insertUsageLog(
      makeLogInput({
        model_id: "gpt-4o-mini",
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
        total_cost: 0.05,
        requested_at: "2026-04-19T11:00:00.000Z",
      }),
    );

    const csv = exportToCsv(repo, {
      period: "all",
      groupByModel: true,
      includeAggregateRow: true,
    });
    const lines = csv.split("\n");

    // Should have: header + 1 gpt-4o row + subtotal + 1 gpt-4o-mini row + subtotal + TOTAL
    expect(lines.some((l) => l.includes("SUBTOTAL (gpt-4o)"))).toBe(true);
    expect(lines.some((l) => l.includes("SUBTOTAL (gpt-4o-mini)"))).toBe(true);
    expect(lines.some((l) => l.includes("TOTAL"))).toBe(true);

    // Verify the subtotal for gpt-4o has the right token count
    const gpt4oSubtotal = lines.find((l) => l.includes("SUBTOTAL (gpt-4o)"))!;
    expect(gpt4oSubtotal).toContain("100"); // prompt_tokens
    expect(gpt4oSubtotal).toContain("50"); // completion_tokens
    expect(gpt4oSubtotal).toContain("150"); // total_tokens
  });

  it("should filter by date range", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-10T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-20T10:00:00.000Z" }),
    );

    const csv = exportToCsv(repo, {
      dateRange: { start: "2026-04-15", end: "2026-04-25" },
      includeHeaders: false,
    });
    const lines = csv.split("\n").filter((l) => l.trim());

    // Only the April 20 log should be included
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("2026-04-20");
  });

  it("should filter by provider", () => {
    repo.insertUsageLog(
      makeLogInput({ provider_id: "openai", model_id: "gpt-4o" }),
    );
    repo.insertUsageLog(
      makeLogInput({
        provider_id: "anthropic",
        model_id: "claude-3.5-sonnet",
      }),
    );

    const csv = exportToCsv(repo, {
      period: "all",
      providers: ["openai"],
      includeHeaders: false,
    });
    const lines = csv.split("\n").filter((l) => l.trim());

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("openai");
    expect(lines[0]).not.toContain("anthropic");
  });

  it("should filter by model", () => {
    repo.insertUsageLog(
      makeLogInput({ provider_id: "openai", model_id: "gpt-4o" }),
    );
    repo.insertUsageLog(
      makeLogInput({
        provider_id: "openai",
        model_id: "gpt-4o-mini",
      }),
    );

    const csv = exportToCsv(repo, {
      period: "all",
      models: ["gpt-4o-mini"],
      includeHeaders: false,
    });
    const lines = csv.split("\n").filter((l) => l.trim());

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("gpt-4o-mini");
  });

  it("should handle empty result set", () => {
    const csv = exportToCsv(repo, { period: "all" });
    const lines = csv.split("\n");
    // Only header, no data rows
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("Date");
  });

  it("should handle single row", () => {
    repo.insertUsageLog(makeLogInput());
    const csv = exportToCsv(repo, { period: "all" });
    const lines = csv.split("\n");
    expect(lines.length).toBe(2); // header + 1 row
  });

  it("should escape CSV special characters: commas, quotes, newlines", () => {
    repo.insertUsageLog(
      makeLogInput({
        endpoint: 'test,"endpoint",value\nnewline',
        requested_at: "2026-04-19T10:00:00.000Z",
      }),
    );

    const csv = exportToCsv(repo, { period: "all", includeHeaders: false });
    const lines = csv.split("\n");

    // The endpoint field should be properly escaped
    expect(lines[0]).toContain('"test,""endpoint"",value');
  });

  it("should sort rows by requested_at ascending", () => {
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-20T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-19T10:00:00.000Z" }),
    );
    repo.insertUsageLog(
      makeLogInput({ requested_at: "2026-04-18T10:00:00.000Z" }),
    );

    const csv = exportToCsv(repo, {
      period: "all",
      includeHeaders: false,
    });
    const lines = csv.split("\n").filter((l) => l.trim());

    // First line should be the earliest date
    expect(lines[0]).toContain("2026-04-18");
    expect(lines[1]).toContain("2026-04-19");
    expect(lines[2]).toContain("2026-04-20");
  });
});
