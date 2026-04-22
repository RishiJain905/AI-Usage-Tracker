/**
 * Data Cleanup — manage data retention and automatic cleanup of old usage logs.
 *
 * IMPORTANT: This module ONLY deletes from usage_logs. It NEVER touches
 * daily_summary or weekly_summary tables.
 */

import { format, subDays } from "date-fns";
import { UsageRepository } from "./repository";

// ---------------------------------------------------------------------------
// Settings keys
// ---------------------------------------------------------------------------

const SETTING_AUTO_CLEANUP = "data_retention_auto_cleanup";
const SETTING_RETENTION_DAYS = "data_retention_days";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the configured retention period in days.
 * Defaults to 90 days if not configured.
 */
export function getRetentionDays(repository: UsageRepository): number {
  const raw = repository.getSetting(SETTING_RETENTION_DAYS);
  if (raw === null) {
    return 90;
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) {
    return 90;
  }
  return parsed;
}

/**
 * Check whether automatic cleanup should run.
 * Defaults to true if not configured.
 */
export function shouldRunCleanup(repository: UsageRepository): boolean {
  const raw = repository.getSetting(SETTING_AUTO_CLEANUP);
  if (raw === null) {
    return true; // default to enabled
  }
  return raw === "true" || raw === "1";
}

/**
 * Run data cleanup: delete usage logs older than the retention period,
 * then vacuum the database.
 *
 * Only deletes from `usage_logs`. NEVER touches `daily_summary` or `weekly_summary`.
 *
 * @returns The number of deleted rows.
 */
export function runCleanup(
  repository: UsageRepository,
  retentionDays: number,
): number {
  if (retentionDays <= 0) {
    return 0; // retention of 0 means keep everything
  }

  const cutoffDate = format(subDays(new Date(), retentionDays), "yyyy-MM-dd");
  const deletedCount = repository.deleteUsageBefore(cutoffDate);

  // Reclaim disk space
  repository.vacuum();

  return deletedCount;
}
