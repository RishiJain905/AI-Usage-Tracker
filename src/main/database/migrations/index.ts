/**
 * Migration runner — tracks applied migrations in a `migrations` table
 * and runs any pending ones inside individual transactions.
 */

import Database from "better-sqlite3";

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

// Import all migrations in order
import { migration001 } from "./001-initial-schema";
import { migration002 } from "./002-task-5-usage-metadata";

const ALL_MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  // Future migrations: add here in order
];

/**
 * Run all pending migrations that have not yet been applied.
 * Each migration runs in its own transaction so a failure only rolls back
 * that single migration, leaving previously-applied ones intact.
 */
export function runMigrations(db: Database.Database): void {
  // Get applied migrations
  const applied = db
    .prepare("SELECT version FROM migrations ORDER BY version")
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(applied.map((row) => row.version));

  // Filter and sort pending migrations
  const pending = ALL_MIGRATIONS.filter(
    (m) => !appliedVersions.has(m.version),
  ).sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    console.info("[Migrations] No pending migrations");
    return;
  }

  console.info(
    `[Migrations] Running ${pending.length} pending migration(s)...`,
  );

  for (const migration of pending) {
    const transaction = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO migrations (version, description) VALUES (?, ?)",
      ).run(migration.version, migration.description);
    });
    transaction();
    console.info(
      `[Migrations] Applied v${migration.version}: ${migration.description}`,
    );
  }

  console.info("[Migrations] All migrations applied");
}

/**
 * Return a sorted list of already-applied migration versions.
 */
export function getAppliedVersions(db: Database.Database): number[] {
  const rows = db
    .prepare("SELECT version FROM migrations ORDER BY version")
    .all() as Array<{ version: number }>;
  return rows.map((row) => row.version);
}
