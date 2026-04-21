/**
 * V3 Migration — Add index on usage_logs.source for ZhipuAI sync deduplication.
 */

import type Database from "better-sqlite3";
import type { Migration } from "./index";

export const migration003: Migration = {
  version: 3,
  description: "Add index on usage_logs.source for sync deduplication queries",

  up(db: Database.Database): void {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_logs_source
      ON usage_logs(source);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP INDEX IF EXISTS idx_usage_logs_source;
    `);
  },
};
