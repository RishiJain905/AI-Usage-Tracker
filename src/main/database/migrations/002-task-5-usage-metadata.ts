import type Database from "better-sqlite3";
import type { Migration } from "./index";

function hasColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
): boolean {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === columnName);
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  if (hasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export const migration002: Migration = {
  version: 2,
  description:
    "Task 5 usage metadata columns for logs and additive token counters",

  up(db: Database.Database): void {
    addColumnIfMissing(
      db,
      "usage_logs",
      "is_estimated",
      "BOOLEAN NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(db, "usage_logs", "estimation_source", "TEXT");
    addColumnIfMissing(db, "usage_logs", "pricing_source", "TEXT");
    addColumnIfMissing(
      db,
      "usage_logs",
      "cached_read_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "cached_write_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "image_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "audio_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "reasoning_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "image_count",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "usage_logs",
      "estimated_request_count",
      "INTEGER NOT NULL DEFAULT 0",
    );

    addColumnIfMissing(
      db,
      "daily_summary",
      "estimated_request_count",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "cached_read_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "cached_write_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "image_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "audio_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "reasoning_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "daily_summary",
      "image_count",
      "INTEGER NOT NULL DEFAULT 0",
    );

    addColumnIfMissing(
      db,
      "weekly_summary",
      "estimated_request_count",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "cached_read_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "cached_write_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "image_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "audio_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "reasoning_tokens",
      "INTEGER NOT NULL DEFAULT 0",
    );
    addColumnIfMissing(
      db,
      "weekly_summary",
      "image_count",
      "INTEGER NOT NULL DEFAULT 0",
    );
  },

  down(): void {
    // SQLite cannot drop columns in-place. We intentionally keep down() as a
    // no-op because runtime migrations only move forward in this app.
  },
};
