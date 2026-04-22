import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../database/migrations/index";
import { seedDatabase } from "../database/seed";
import { UsageRepository, createRepository } from "../database/repository";
import type { InsertUsageLogInput } from "../database/types";
import { ZhipuAiSync } from "./zhipuai-sync";
import type { ZhipuAiModelUsage } from "./zhipuai-sync";

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
    provider_id: "glm",
    model_id: "glm-4",
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    input_cost: 0.01,
    output_cost: 0.02,
    total_cost: 0.03,
    request_duration_ms: 500,
    is_streaming: false,
    is_error: false,
    source: "proxy",
    requested_at: "2026-04-19T10:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("ZhipuAiSync", () => {
  let db: Database.Database;
  let repo: UsageRepository;
  let sync: ZhipuAiSync;

  beforeEach(() => {
    ({ db, repo } = createTestDb());
    sync = new ZhipuAiSync();
  });

  afterEach(() => {
    db.close();
  });

  describe("findMissing", () => {
    it("should identify entries not already in usage_logs", () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
        {
          date: "2026-04-20",
          model: "glm-4",
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          cost: 0.06,
        },
      ];

      // Existing logs only have April 19
      repo.insertUsageLog(
        makeLogInput({
          model_id: "glm-4",
          total_tokens: 150,
          requested_at: "2026-04-19T10:00:00.000Z",
        }),
      );

      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing(remoteData, existingLogs);

      // Only April 20 should be missing
      expect(missing.length).toBe(1);
      expect(missing[0].date).toBe("2026-04-20");
    });

    it("should skip entries already tracked by proxy", () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
      ];

      // Insert matching proxy log
      repo.insertUsageLog(
        makeLogInput({
          model_id: "glm-4",
          total_tokens: 150,
          source: "proxy",
          requested_at: "2026-04-19T10:00:00.000Z",
        }),
      );

      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing(remoteData, existingLogs);
      expect(missing.length).toBe(0);
    });

    it("should skip entries within 5% tolerance of token counts", () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 152, // within 5% of 150
          cost: 0.03,
        },
      ];

      repo.insertUsageLog(
        makeLogInput({
          model_id: "glm-4",
          total_tokens: 150,
          requested_at: "2026-04-19T10:00:00.000Z",
        }),
      );

      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing(remoteData, existingLogs);
      expect(missing.length).toBe(0);
    });

    it("should handle empty remote data", () => {
      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing([], existingLogs);
      expect(missing.length).toBe(0);
    });

    it("should handle all entries already tracked", () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
      ];

      repo.insertUsageLog(
        makeLogInput({
          model_id: "glm-4",
          total_tokens: 150,
          requested_at: "2026-04-19T10:00:00.000Z",
        }),
      );

      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing(remoteData, existingLogs);
      expect(missing.length).toBe(0);
    });

    it("should identify complete gap fill when no existing logs", () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
        {
          date: "2026-04-20",
          model: "glm-4",
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          cost: 0.06,
        },
      ];

      const existingLogs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100000,
        offset: 0,
      });

      const missing = sync.findMissing(remoteData, existingLogs);

      // All entries should be missing
      expect(missing.length).toBe(2);
    });
  });

  describe("sync (mocked fetchModelUsage)", () => {
    it("should import missing entries with source 'sync'", async () => {
      // Mock fetchModelUsage by overriding the private method
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
      ];

      // Mock private method
      (sync as any).fetchModelUsage = async () => remoteData;

      const result = await sync.sync(repo, "test-api-key", "2026-04-01");

      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.totalTokens).toBe(150);
      expect(result.totalCost).toBe(0.03);
      expect(result.providerId).toBe("glm");

      // Verify the inserted log has correct fields
      const logs = repo.getUsageLogs({
        providerId: "glm",
        startDate: "2026-04-01",
        limit: 100,
        offset: 0,
      });
      expect(logs.length).toBe(1);
      expect(logs[0].source).toBe("sync");
      expect(logs[0].is_estimated).toBeTruthy();
      expect(logs[0].estimation_source).toBe("zhipuai-sync");
    });

    it("should return correct imported and skipped counts", async () => {
      // Insert an existing log
      repo.insertUsageLog(
        makeLogInput({
          model_id: "glm-4",
          total_tokens: 150,
          requested_at: "2026-04-19T00:00:00.000Z",
        }),
      );

      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
        {
          date: "2026-04-20",
          model: "glm-4",
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          cost: 0.06,
        },
      ];

      (sync as any).fetchModelUsage = async () => remoteData;

      const result = await sync.sync(repo, "test-api-key", "2026-04-01");

      expect(result.importedCount).toBe(1); // Only April 20
      expect(result.skippedCount).toBe(1); // April 19 already exists
    });

    it("should handle empty remote data", async () => {
      (sync as any).fetchModelUsage = async () => [];

      const result = await sync.sync(repo, "test-api-key", "2026-04-01");

      expect(result.importedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it("should store last sync timestamp in settings", async () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
      ];

      (sync as any).fetchModelUsage = async () => remoteData;

      await sync.sync(repo, "test-api-key", "2026-04-01");

      const lastSync = repo.getSetting("last_sync_zhipuai");
      expect(lastSync).not.toBeNull();
      expect(lastSync).toBeTruthy();
    });

    it("should recalculate daily summaries for affected dates", async () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-19",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
      ];

      (sync as any).fetchModelUsage = async () => remoteData;

      await sync.sync(repo, "test-api-key", "2026-04-01");

      // Check that daily summary was created/updated
      const dailySummaries = repo.getDailySummary({
        start: "2026-04-19",
        end: "2026-04-19",
      });

      // Should have a daily summary for zhipuai/glm-4
      const matchingSummary = dailySummaries.find(
        (s) => s.provider_id === "glm" && s.model_id === "glm-4",
      );
      expect(matchingSummary).toBeDefined();
      expect(matchingSummary!.total_tokens).toBe(150);
    });

    it("should return correct SyncResult shape", async () => {
      const remoteData: ZhipuAiModelUsage[] = [
        {
          date: "2026-04-18",
          model: "glm-4",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.03,
        },
        {
          date: "2026-04-20",
          model: "glm-4",
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          cost: 0.06,
        },
      ];

      (sync as any).fetchModelUsage = async () => remoteData;

      const result = await sync.sync(repo, "test-api-key", "2026-04-01");

      expect(result).toHaveProperty("providerId");
      expect(result).toHaveProperty("importedCount");
      expect(result).toHaveProperty("skippedCount");
      expect(result).toHaveProperty("totalTokens");
      expect(result).toHaveProperty("totalCost");
      expect(result).toHaveProperty("syncRange");

      expect(result.syncRange.start).toBe("2026-04-18");
      expect(result.syncRange.end).toBe("2026-04-20");
    });
  });
});
