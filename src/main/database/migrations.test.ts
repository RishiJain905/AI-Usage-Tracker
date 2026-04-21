import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, getAppliedVersions } from "./migrations/index";
import { migration001 } from "./migrations/001-initial-schema";

describe("Migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    // Create migrations tracking table (mirrors what initDatabase does)
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        description TEXT,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // runMigrations
  // ---------------------------------------------------------------------------

  describe("runMigrations", () => {
    it("should apply the V1 migration and create all tables", () => {
      runMigrations(db);

      const expectedTables = [
        "providers",
        "models",
        "usage_logs",
        "daily_summary",
        "weekly_summary",
        "settings",
        "api_keys",
      ];

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
        .map((r: any) => r.name);

      for (const t of expectedTables) {
        expect(tables).toContain(t);
      }
    });

    it("should create all expected indexes", () => {
      runMigrations(db);

      const expectedIndexes = [
        "idx_usage_logs_provider",
        "idx_usage_logs_model",
        "idx_usage_logs_requested_at",
        "idx_usage_logs_provider_date",
        "idx_usage_logs_model_date",
        "idx_daily_summary_date",
        "idx_daily_summary_provider",
        "idx_daily_summary_model",
        "idx_weekly_summary_week",
        "idx_weekly_summary_provider",
        "idx_weekly_summary_model",
      ];

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((r: any) => r.name);

      for (const idx of expectedIndexes) {
        expect(indexes).toContain(idx);
      }
    });

    it("should record the applied migration in the migrations table", () => {
      runMigrations(db);

      const row = db
        .prepare(
          "SELECT version, description FROM migrations WHERE version = 1",
        )
        .get() as { version: number; description: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.version).toBe(1);
      expect(row!.description).toContain("Initial schema");
    });

    it("should be idempotent — running twice does not re-apply", () => {
      runMigrations(db);
      runMigrations(db);

      const rows = db
        .prepare("SELECT COUNT(*) AS cnt FROM migrations")
        .get() as { cnt: number };
      expect(rows.cnt).toBe(3);
    });

    it("should not fail when there are no pending migrations", () => {
      runMigrations(db);

      // Second run should complete without error
      expect(() => runMigrations(db)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getAppliedVersions
  // ---------------------------------------------------------------------------

  describe("getAppliedVersions", () => {
    it("should return empty array when no migrations applied", () => {
      const versions = getAppliedVersions(db);
      expect(versions).toEqual([]);
    });

    it("should return applied versions after running migrations", () => {
      runMigrations(db);
      const versions = getAppliedVersions(db);
      expect(versions).toEqual([1, 2, 3]);
    });
  });

  // ---------------------------------------------------------------------------
  // V1 Migration up/down
  // ---------------------------------------------------------------------------

  describe("V1 migration up()", () => {
    it("should create providers table with correct columns", () => {
      migration001.up(db);

      const info = db.pragma("table_info(providers)") as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = info.map((c) => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("base_url");
      expect(columnNames).toContain("icon");
      expect(columnNames).toContain("is_active");
      expect(columnNames).toContain("created_at");
    });

    it("should create usage_logs table with correct columns", () => {
      migration001.up(db);

      const info = db.pragma("table_info(usage_logs)") as Array<{
        name: string;
      }>;
      const columnNames = info.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("provider_id");
      expect(columnNames).toContain("model_id");
      expect(columnNames).toContain("prompt_tokens");
      expect(columnNames).toContain("completion_tokens");
      expect(columnNames).toContain("total_tokens");
      expect(columnNames).toContain("requested_at");
    });

    it("should create daily_summary with UNIQUE constraint on (date, provider_id, model_id)", () => {
      migration001.up(db);

      const indexes = db.pragma("index_list(daily_summary)") as Array<{
        name: string;
        unique: number;
        origin: string;
      }>;
      const uniqueIndex = indexes.find((idx) => idx.unique === 1);
      expect(uniqueIndex).toBeDefined();
    });

    it("should create weekly_summary with UNIQUE constraint on (week_start, provider_id, model_id)", () => {
      migration001.up(db);

      const indexes = db.pragma("index_list(weekly_summary)") as Array<{
        name: string;
        unique: number;
      }>;
      const uniqueIndex = indexes.find((idx) => idx.unique === 1);
      expect(uniqueIndex).toBeDefined();
    });
  });

  describe("Task 5 schema migration", () => {
    it("should add normalized Task 5 columns to usage_logs", () => {
      runMigrations(db);

      const info = db.pragma("table_info(usage_logs)") as Array<{
        name: string;
      }>;
      const columnNames = info.map((column) => column.name);

      expect(columnNames).toContain("is_estimated");
      expect(columnNames).toContain("estimation_source");
      expect(columnNames).toContain("pricing_source");
      expect(columnNames).toContain("cached_read_tokens");
      expect(columnNames).toContain("cached_write_tokens");
      expect(columnNames).toContain("image_tokens");
      expect(columnNames).toContain("audio_tokens");
      expect(columnNames).toContain("reasoning_tokens");
      expect(columnNames).toContain("image_count");
      expect(columnNames).toContain("estimated_request_count");
    });

    it("should add additive Task 5 columns to daily_summary and weekly_summary", () => {
      runMigrations(db);

      const dailyInfo = db.pragma("table_info(daily_summary)") as Array<{
        name: string;
      }>;
      const weeklyInfo = db.pragma("table_info(weekly_summary)") as Array<{
        name: string;
      }>;
      const expectedColumns = [
        "estimated_request_count",
        "cached_read_tokens",
        "cached_write_tokens",
        "image_tokens",
        "audio_tokens",
        "reasoning_tokens",
        "image_count",
      ];

      const dailyColumns = dailyInfo.map((column) => column.name);
      const weeklyColumns = weeklyInfo.map((column) => column.name);

      for (const column of expectedColumns) {
        expect(dailyColumns).toContain(column);
        expect(weeklyColumns).toContain(column);
      }
    });
  });

  describe("V1 migration down()", () => {
    it("should drop all tables", () => {
      migration001.up(db);
      migration001.down(db);

      const expectedTables = [
        "providers",
        "models",
        "usage_logs",
        "daily_summary",
        "weekly_summary",
        "settings",
        "api_keys",
      ];

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
        .map((r: any) => r.name);

      for (const t of expectedTables) {
        expect(tables).not.toContain(t);
      }
    });
  });
});
