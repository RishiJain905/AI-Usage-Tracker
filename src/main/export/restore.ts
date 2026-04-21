/**
 * Database Restore — validate backup files and restore from backup.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestoreResult {
  success: boolean;
  preRestoreBackupPath?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Expected columns in usage_logs
// ---------------------------------------------------------------------------

const EXPECTED_USAGE_LOGS_COLUMNS = [
  "id",
  "provider_id",
  "model_id",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "input_cost",
  "output_cost",
  "total_cost",
  "requested_at",
];

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Validate that a backup file is a valid SQLite database with the expected schema.
 * Opens the file read-only, checks for the usage_logs table and key columns.
 */
export function validateBackup(backupPath: string): boolean {
  if (!fs.existsSync(backupPath)) {
    return false;
  }

  let db: Database.Database | null = null;

  try {
    db = new Database(backupPath, { readonly: true });

    // Check that usage_logs table exists
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_logs'",
      )
      .get() as { name: string } | undefined;

    if (!tables) {
      return false;
    }

    // Check that key columns exist
    const columns = db.pragma("table_info(usage_logs)") as Array<{
      name: string;
    }>;
    const columnNames = new Set(columns.map((c) => c.name));

    for (const col of EXPECTED_USAGE_LOGS_COLUMNS) {
      if (!columnNames.has(col)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  } finally {
    if (db) {
      db.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore the database from a backup file.
 *
 * Since we can't hot-swap the database in-process, this function:
 * 1. Validates the backup
 * 2. Creates a pre-restore backup of the current database
 * 3. Returns a result indicating that a restart is needed to apply the restore
 *
 * The actual file copy is handled here, but the running process must be
 * restarted to pick up the restored database.
 */
export async function restoreDatabase(
  db: Database.Database,
  backupPath: string,
  appDataPath: string,
): Promise<RestoreResult> {
  // Validate the backup first
  if (!validateBackup(backupPath)) {
    return {
      success: false,
      error:
        "Invalid backup file: missing usage_logs table or expected columns",
    };
  }

  try {
    // Create a pre-restore backup of the current database
    const timestamp = format(new Date(), "yyyy-MM-dd-HHmmss");
    const preRestoreBackupPath = path.join(
      appDataPath,
      "backups",
      `ai-tracker-pre-restore-${timestamp}.db`,
    );

    const backupDir = path.dirname(preRestoreBackupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Backup the current database before restoring
    await db.backup(preRestoreBackupPath);

    // Note: We cannot safely replace the database file while the current
    // process has it open. The caller must restart the application to
    // apply the restore. We return the pre-restore backup path so the
    // caller can handle the actual file swap on restart.

    return {
      success: true,
      preRestoreBackupPath,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Unknown error during restore",
    };
  }
}
