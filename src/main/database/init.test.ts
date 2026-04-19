import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { initDatabase, closeDatabase } from "./init";
import { SEED_PROVIDERS, SEED_MODELS } from "./seed";

describe("initDatabase", () => {
  let db: Database.Database | null = null;
  let tmpDir: string | null = null;

  afterEach(() => {
    if (db) {
      closeDatabase(db);
      db = null;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("should create the database file on disk", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const dbPath = path.join(tmpDir, "ai-tracker.db");
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("should return a working database instance", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    // Verify the db is usable
    const result = db.prepare("SELECT 1 AS val").get() as { val: number };
    expect(result.val).toBe(1);
  });

  it("should enable WAL journal mode", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const mode = db.pragma("journal_mode", { simple: true }) as string;
    expect(mode).toBe("wal");
  });

  it("should enable foreign keys", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const fk = db.pragma("foreign_keys", { simple: true }) as number;
    expect(fk).toBe(1);
  });

  it("should create the migrations tracking table", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
      )
      .get();
    expect(table).toBeDefined();
  });

  it("should create all required tables", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const expectedTables = [
      "migrations",
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

  it("should seed providers and models", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);

    const providers = db
      .prepare("SELECT COUNT(*) AS cnt FROM providers")
      .get() as { cnt: number };
    const models = db
      .prepare("SELECT COUNT(*) AS cnt FROM models")
      .get() as { cnt: number };

    expect(providers.cnt).toBe(SEED_PROVIDERS.length);
    expect(models.cnt).toBe(SEED_MODELS.length);
  });

  it("should be idempotent — calling twice does not fail or duplicate", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-init-"));
    db = initDatabase(tmpDir);
    closeDatabase(db);

    // Re-open the same database
    db = initDatabase(tmpDir);

    const providers = db
      .prepare("SELECT COUNT(*) AS cnt FROM providers")
      .get() as { cnt: number };
    expect(providers.cnt).toBe(SEED_PROVIDERS.length);

    // Migrations should not be duplicated
    const migrations = db
      .prepare("SELECT COUNT(*) AS cnt FROM migrations")
      .get() as { cnt: number };
    expect(migrations.cnt).toBe(1); // Only v1
  });
});

describe("closeDatabase", () => {
  it("should close the database without error", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitracker-close-"));
    const db = initDatabase(tmpDir);

    expect(() => closeDatabase(db)).not.toThrow();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
