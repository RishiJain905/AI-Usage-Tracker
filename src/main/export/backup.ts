/**
 * Database Backup — create, rotate, and manage SQLite database backups.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Backup file path
// ---------------------------------------------------------------------------

/**
 * Generate a backup file path with today's date.
 * Pattern: `ai-tracker-backup-YYYY-MM-DD.db`
 */
export function getBackupFilePath(appDataPath: string): string {
  const backupDir = path.join(appDataPath, "backups");
  const dateStr = format(new Date(), "yyyy-MM-dd");
  return path.join(backupDir, `ai-tracker-backup-${dateStr}.db`);
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/**
 * Create a backup of the database using better-sqlite3's `.backup()` method.
 * Creates the backup directory if it doesn't exist.
 */
export async function backupDatabase(
  db: Database.Database,
  backupPath: string,
): Promise<void> {
  // Ensure the backup directory exists
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Use better-sqlite3's built-in backup method (returns a promise)
  await db.backup(backupPath);
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * Rotate backups: keep only the most recent `maxBackups` backup files.
 * Files are sorted by date embedded in the filename (YYYY-MM-DD).
 */
export function rotateBackups(backupDir: string, maxBackups: number = 5): void {
  if (!fs.existsSync(backupDir)) {
    return;
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("ai-tracker-backup-") && f.endsWith(".db"))
    .sort()
    .reverse(); // newest first

  if (files.length <= maxBackups) {
    return;
  }

  // Delete files beyond maxBackups (these are the oldest)
  const toDelete = files.slice(maxBackups);
  for (const file of toDelete) {
    const filePath = path.join(backupDir, file);
    fs.unlinkSync(filePath);
  }
}
