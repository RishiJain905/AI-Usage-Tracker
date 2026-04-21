/**
 * Database initialisation — opens (or creates) the SQLite database,
 * enables WAL mode and foreign keys, ensures the migrations tracking
 * table exists, runs any pending migrations, and seeds reference data.
 */

import Database from "better-sqlite3";
import path from "path";
import { runMigrations } from "./migrations";
import { seedDatabase } from "./seed";

let _currentDb: Database.Database | null = null;

/**
 * Open and initialise the database.
 *
 * @param userDataPath - Electron's `app.getPath("userData")` directory.
 * @returns A configured better-sqlite3 Database instance.
 */
export function initDatabase(userDataPath: string): Database.Database {
  const dbPath = path.join(userDataPath, "ai-tracker.db");
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Run pending migrations
  runMigrations(db);

  // Seed reference data (providers + models) — idempotent via INSERT OR IGNORE
  seedDatabase(db);

  _currentDb = db;
  return db;
}

/**
 * Get the current database instance.
 * Returns null if the database has not been initialized yet.
 */
export function getDatabase(): Database.Database {
  if (!_currentDb) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return _currentDb;
}

/**
 * Gracefully close the database connection.
 */
export function closeDatabase(db: Database.Database): void {
  _currentDb = null;
  db.close();
}
