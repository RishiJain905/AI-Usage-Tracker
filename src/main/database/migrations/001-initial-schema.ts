/**
 * V1 Migration — Initial schema.
 *
 * Creates all core tables: providers, models, usage_logs, daily_summary,
 * weekly_summary, settings, and api_keys along with their indexes.
 */

import type Database from "better-sqlite3";
import type { Migration } from "./index";

export const migration001: Migration = {
  version: 1,
  description:
    "Initial schema — providers, models, usage_logs, daily_summary, weekly_summary, settings, api_keys",

  up(db: Database.Database): void {
    db.exec(`
      -- Providers table
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        icon TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Models table
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        input_price_per_million REAL,
        output_price_per_million REAL,
        is_local BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      );

      -- Usage logs table
      CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        endpoint TEXT,
        method TEXT DEFAULT 'POST',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        input_cost REAL DEFAULT 0,
        output_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        request_duration_ms INTEGER,
        is_streaming BOOLEAN DEFAULT 0,
        is_error BOOLEAN DEFAULT 0,
        error_message TEXT,
        app_name TEXT,
        tags TEXT,
        source TEXT DEFAULT 'proxy',
        requested_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (model_id) REFERENCES models(id)
      );

      -- Indexes for usage_logs
      CREATE INDEX IF NOT EXISTS idx_usage_logs_provider ON usage_logs(provider_id);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model_id);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_requested_at ON usage_logs(requested_at);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_provider_date ON usage_logs(provider_id, date(requested_at));
      CREATE INDEX IF NOT EXISTS idx_usage_logs_model_date ON usage_logs(model_id, date(requested_at));

      -- Daily summary table
      CREATE TABLE IF NOT EXISTS daily_summary (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        input_cost REAL DEFAULT 0,
        output_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_duration_ms REAL DEFAULT 0,
        UNIQUE(date, provider_id, model_id),
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (model_id) REFERENCES models(id)
      );

      -- Weekly summary table
      CREATE TABLE IF NOT EXISTS weekly_summary (
        id TEXT PRIMARY KEY,
        week_start TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        input_cost REAL DEFAULT 0,
        output_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_duration_ms REAL DEFAULT 0,
        UNIQUE(week_start, provider_id, model_id),
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (model_id) REFERENCES models(id)
      );

      -- Daily summary indexes
      CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_summary(date);
      CREATE INDEX IF NOT EXISTS idx_daily_summary_provider ON daily_summary(provider_id, date);
      CREATE INDEX IF NOT EXISTS idx_daily_summary_model ON daily_summary(model_id, date);

      -- Weekly summary indexes
      CREATE INDEX IF NOT EXISTS idx_weekly_summary_week ON weekly_summary(week_start);
      CREATE INDEX IF NOT EXISTS idx_weekly_summary_provider ON weekly_summary(provider_id, week_start);
      CREATE INDEX IF NOT EXISTS idx_weekly_summary_model ON weekly_summary(model_id, week_start);

      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- API keys table
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        is_valid BOOLEAN DEFAULT 1,
        last_validated_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      );
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS weekly_summary;
      DROP TABLE IF EXISTS daily_summary;
      DROP TABLE IF EXISTS usage_logs;
      DROP TABLE IF EXISTS models;
      DROP TABLE IF EXISTS providers;
    `);
  },
};
