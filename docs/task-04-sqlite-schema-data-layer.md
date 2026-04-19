# Task 4: SQLite Schema & Data Layer

## Objective
Design the SQLite database schema and implement the data access layer for storing and querying AI usage data.

## Steps

### 4.1 Design database schema

File: `src/main/database/init.ts`

```sql
-- Providers table
CREATE TABLE providers (
  id TEXT PRIMARY KEY,           -- e.g., "openai", "anthropic"
  name TEXT NOT NULL,            -- Display name: "OpenAI"
  base_url TEXT NOT NULL,        -- Provider API base URL
  icon TEXT,                     -- Icon identifier
  is_active BOOLEAN DEFAULT 1,  -- Whether tracking is enabled
  created_at TEXT DEFAULT (datetime('now'))
);

-- Models table
CREATE TABLE models (
  id TEXT PRIMARY KEY,           -- e.g., "gpt-4o", "claude-3.5-sonnet"
  provider_id TEXT NOT NULL,     -- FK to providers
  name TEXT NOT NULL,            -- Display name
  input_price_per_million REAL, -- Price per 1M input tokens (USD)
  output_price_per_million REAL,-- Price per 1M output tokens (USD)
  is_local BOOLEAN DEFAULT 0,   -- Local model (e.g., local Ollama). Cloud Ollama = false
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

-- Usage logs table (the main table)
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,           -- UUID
  provider_id TEXT NOT NULL,     -- FK to providers
  model_id TEXT NOT NULL,        -- FK to models
  endpoint TEXT,                 -- e.g., "/v1/chat/completions"
  method TEXT DEFAULT 'POST',

  -- Token counts
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  -- Cost (calculated at insertion time)
  input_cost REAL DEFAULT 0,    -- USD
  output_cost REAL DEFAULT 0,   -- USD
  total_cost REAL DEFAULT 0,    -- USD

  -- Request metadata
  request_duration_ms INTEGER,  -- Time from request to response
  is_streaming BOOLEAN DEFAULT 0,
  is_error BOOLEAN DEFAULT 0,
  error_message TEXT,

  -- Additional context
  app_name TEXT,                 -- Which app made the request (if detectable)
  tags TEXT,                     -- JSON array of tags
  source TEXT DEFAULT 'proxy',   -- 'proxy' (live-tracked) or 'sync' (backfilled from provider API)

  -- Timestamps
  requested_at TEXT NOT NULL,    -- When the request was made
  completed_at TEXT,             -- When the response was received
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (provider_id) REFERENCES providers(id),
  FOREIGN KEY (model_id) REFERENCES models(id)
);

-- Indexes for common queries
CREATE INDEX idx_usage_logs_provider ON usage_logs(provider_id);
CREATE INDEX idx_usage_logs_model ON usage_logs(model_id);
CREATE INDEX idx_usage_logs_requested_at ON usage_logs(requested_at);
CREATE INDEX idx_usage_logs_provider_date ON usage_logs(provider_id, date(requested_at));
CREATE INDEX idx_usage_logs_model_date ON usage_logs(model_id, date(requested_at));

-- Daily aggregates (materialized for fast dashboard queries)
-- CRITICAL: Each row is per-model-per-day to enable BOTH:
--   1. Per-model daily tracking (filter by model_id)
--   2. Aggregate daily total (SUM across all model_ids for a given date)
CREATE TABLE daily_summary (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,            -- YYYY-MM-DD
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

-- Weekly aggregates (pre-computed for fast weekly dashboard views)
-- Each row is per-model-per-week to enable per-model AND aggregate weekly totals
CREATE TABLE weekly_summary (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,     -- YYYY-MM-DD (Monday of the week)
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

CREATE INDEX idx_daily_summary_date ON daily_summary(date);
CREATE INDEX idx_daily_summary_provider ON daily_summary(provider_id, date);
CREATE INDEX idx_daily_summary_model ON daily_summary(model_id, date);
CREATE INDEX idx_weekly_summary_week ON weekly_summary(week_start);
CREATE INDEX idx_weekly_summary_provider ON weekly_summary(provider_id, week_start);
CREATE INDEX idx_weekly_summary_model ON weekly_summary(model_id, week_start);

-- Settings table
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- API keys table (encrypted at rest)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,   -- Encrypted API key
  is_valid BOOLEAN DEFAULT 1,
  last_validated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);
```

### 4.2 Implement database initialization

File: `src/main/database/init.ts`

- Use `better-sqlite3` to create/open the database
- Store DB file in `app.getPath('userData')/ai-tracker.db`
- Run schema on first launch
- Support schema migrations for future updates

### 4.3 Implement migration system

File: `src/main/database/migrations/`

```typescript
interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
  down: (db: Database) => void;
}
```

Create a migrations table to track applied migrations:
```sql
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  description TEXT,
  applied_at TEXT DEFAULT (datetime('now'))
);
```

### 4.4 Implement repository layer

File: `src/main/database/repository.ts`

Create typed data access methods:

```typescript
class UsageRepository {
  // Insert
  insertUsageLog(log: Omit<UsageLog, 'id' | 'created_at'>): UsageLog;
  upsertDailySummary(date: string, providerId: string, modelId: string, data: Partial<DailySummary>): void;
  upsertWeeklySummary(weekStart: string, providerId: string, modelId: string, data: Partial<WeeklySummary>): void;

  // Queries — PERIOD-AWARE: every query supports 'today' | 'week' | 'month' | 'all'
  getUsageLogs(filters: UsageFilters): UsageLog[];
  getUsageSummary(period: 'today' | 'week' | 'month' | 'all'): UsageSummary;
  getDailySummary(dateRange: { start: string; end: string }): DailySummary[];
  getWeeklySummary(weekRange: { start: string; end: string }): WeeklySummary[];
  getProviderSummary(providerId: string, period: string): ProviderSummary;

  // PER-MODEL queries — each model tracked separately
  getModelSummary(modelId: string, period: 'today' | 'week' | 'month' | 'all'): ModelSummary;
  getAllModelSummaries(period: 'today' | 'week' | 'month' | 'all'): ModelSummary[];

  // AGGREGATE TOTALS — sum across all models for a given period
  getAggregateTotal(period: 'today' | 'week' | 'month' | 'all'): AggregateTotal;
  getAggregateDailyTotal(date: string): AggregateTotal;        // All models for one day
  getAggregateWeeklyTotal(weekStart: string): AggregateTotal;  // All models for one week
  getAggregateAllTimeTotal(): AggregateTotal;                   // Grand total across everything

  // Per-model breakdown within a period (e.g., today's tokens per model)
  getModelBreakdownForPeriod(period: 'today' | 'week' | 'month' | 'all'): ModelBreakdown[];

  // Aggregations (now period + per-model aware)
  getTotalTokensByProvider(period: string): Record<string, number>;
  getTotalCostByProvider(period: string): Record<string, number>;
  getTotalTokensByModel(period: string): Record<string, number>;
  getTotalCostByModel(period: string): Record<string, number>;
  getTopModels(limit: number, period: string): ModelUsage[];
  getUsageTrend(days: number): DailyTrend[];
  getWeeklyTrend(weeks: number): WeeklyTrend[];

  // Settings
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;

  // Cleanup
  deleteUsageBefore(date: string): number;
  vacuum(): void;
}
```

### 4.5 Implement seed data

File: `src/main/database/seed.ts`

Pre-populate providers and models with pricing:

```typescript
const SEED_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', icon: 'openai' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', icon: 'anthropic' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', icon: 'ollama' },
  // Note: Ollama has two modes — local (http://localhost:11434) and cloud (https://ollama.com/v1)
  // The baseUrl is a default for local mode; cloud mode uses https://ollama.com/v1
  { id: 'glm', name: 'ZhipuAI (GLM)', baseUrl: 'https://api.z.ai', icon: 'glm' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat', icon: 'minimax' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', icon: 'gemini' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai', icon: 'mistral' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com', icon: 'groq' },
];

const SEED_MODELS = [
  // OpenAI
  { id: 'gpt-4o', providerId: 'openai', name: 'GPT-4o', inputPrice: 2.50, outputPrice: 10.00 },
  { id: 'gpt-4o-mini', providerId: 'openai', name: 'GPT-4o Mini', inputPrice: 0.15, outputPrice: 0.60 },
  { id: 'gpt-4-turbo', providerId: 'openai', name: 'GPT-4 Turbo', inputPrice: 10.00, outputPrice: 30.00 },
  { id: 'gpt-3.5-turbo', providerId: 'openai', name: 'GPT-3.5 Turbo', inputPrice: 0.50, outputPrice: 1.50 },
  { id: 'o1-preview', providerId: 'openai', name: 'o1-preview', inputPrice: 15.00, outputPrice: 60.00 },
  { id: 'o1-mini', providerId: 'openai', name: 'o1-mini', inputPrice: 3.00, outputPrice: 12.00 },
  { id: 'text-embedding-3-small', providerId: 'openai', name: 'Embedding 3 Small', inputPrice: 0.02, outputPrice: 0 },
  { id: 'text-embedding-3-large', providerId: 'openai', name: 'Embedding 3 Large', inputPrice: 0.13, outputPrice: 0 },

  // Anthropic
  { id: 'claude-3.5-sonnet', providerId: 'anthropic', name: 'Claude 3.5 Sonnet', inputPrice: 3.00, outputPrice: 15.00 },
  { id: 'claude-3-opus', providerId: 'anthropic', name: 'Claude 3 Opus', inputPrice: 15.00, outputPrice: 75.00 },
  { id: 'claude-3-haiku', providerId: 'anthropic', name: 'Claude 3 Haiku', inputPrice: 0.25, outputPrice: 1.25 },

  // GLM
  { id: 'glm-4', providerId: 'glm', name: 'GLM-4', inputPrice: 0.14, outputPrice: 0.14 },
  { id: 'glm-4-plus', providerId: 'glm', name: 'GLM-4 Plus', inputPrice: 0.50, outputPrice: 0.50 },
  { id: 'glm-4-flash', providerId: 'glm', name: 'GLM-4 Flash', inputPrice: 0.01, outputPrice: 0.01 },

  // MiniMax
  { id: 'abab6.5-chat', providerId: 'minimax', name: 'ABAB 6.5 Chat', inputPrice: 0.30, outputPrice: 0.30 },
  { id: 'abab6.5s-chat', providerId: 'minimax', name: 'ABAB 6.5S Chat', inputPrice: 0.10, outputPrice: 0.10 },

  // Gemini
  { id: 'gemini-1.5-pro', providerId: 'gemini', name: 'Gemini 1.5 Pro', inputPrice: 1.25, outputPrice: 5.00 },
  { id: 'gemini-1.5-flash', providerId: 'gemini', name: 'Gemini 1.5 Flash', inputPrice: 0.075, outputPrice: 0.30 },

  // Mistral
  { id: 'mistral-large', providerId: 'mistral', name: 'Mistral Large', inputPrice: 2.00, outputPrice: 6.00 },
  { id: 'mistral-medium', providerId: 'mistral', name: 'Mistral Medium', inputPrice: 0.70, outputPrice: 2.10 },
  { id: 'mistral-small', providerId: 'mistral', name: 'Mistral Small', inputPrice: 0.20, outputPrice: 0.60 },

  // Groq
  { id: 'llama-3.1-70b-versatile', providerId: 'groq', name: 'Llama 3.1 70B', inputPrice: 0.59, outputPrice: 0.79 },
  { id: 'llama-3.1-8b-instant', providerId: 'groq', name: 'Llama 3.1 8B', inputPrice: 0.05, outputPrice: 0.08 },
  { id: 'mixtral-8x7b-32768', providerId: 'groq', name: 'Mixtral 8x7B', inputPrice: 0.24, outputPrice: 0.24 },

  // Ollama — local models (free, no pricing, default localhost endpoint)
  { id: 'llama3.1', providerId: 'ollama', name: 'Llama 3.1', inputPrice: 0, outputPrice: 0, isLocal: true },
  { id: 'mistral-nemo', providerId: 'ollama', name: 'Mistral Nemo', inputPrice: 0, outputPrice: 0, isLocal: true },
  { id: 'codellama', providerId: 'ollama', name: 'Code Llama', inputPrice: 0, outputPrice: 0, isLocal: true },
  // Ollama — cloud models via https://ollama.com/v1 (OpenAI-compatible API, per-token pricing)
  // Registered when user enables Ollama cloud mode in settings
  // Pricing applied per Ollama's published cloud rates; user can override
  { id: 'ollama-cloud-llama3.1', providerId: 'ollama', name: 'Llama 3.1 (Ollama Cloud)', inputPrice: 0, outputPrice: 0, isLocal: false },
  { id: 'ollama-cloud-qwen2.5', providerId: 'ollama', name: 'Qwen 2.5 (Ollama Cloud)', inputPrice: 0, outputPrice: 0, isLocal: false },
  { id: 'ollama-cloud-gemma3', providerId: 'ollama', name: 'Gemma 3 (Ollama Cloud)', inputPrice: 0, outputPrice: 0, isLocal: false },
];
```

### 4.6 Connect proxy events to database

In the proxy's `request-completed` event handler:
1. Extract usage via the provider implementation
2. Calculate cost via the cost calculator
3. Insert into `usage_logs` (with model attribution)
4. Upsert `daily_summary` (per model per day)
5. Upsert `weekly_summary` (per model per week — week starts Monday)
6. Emit IPC event to renderer with BOTH per-model data AND aggregate totals

## Verification
- Database file is created in app data directory
- Schema tables exist after first launch (including `weekly_summary`)
- Seed providers and models are populated
- Usage logs can be inserted and queried **with model attribution**
- Daily summaries are calculated correctly **per model per day**
- Weekly summaries are calculated correctly **per model per week**
- `getAggregateTotal()` returns correct sums across all models for any period
- `getModelBreakdownForPeriod()` returns per-model breakdowns for today/week/month/all
- `getAllModelSummaries()` returns each model's individual summary
- Indexes speed up common queries (verify with EXPLAIN QUERY PLAN)

## Core Tracking Requirements
This task is the backbone for two critical features:

1. **Per-model separate tracking**: Every usage log, daily summary, and weekly summary is keyed by `model_id`. Users use multiple models throughout the day and must see each one tracked independently. The `getModelSummary()` and `getAllModelSummaries()` methods provide per-model data for any period.

2. **Aggregate totals across all models**: The `getAggregateTotal()`, `getAggregateDailyTotal()`, `getAggregateWeeklyTotal()`, and `getAggregateAllTimeTotal()` methods sum across all models to show the grand total. This powers the "Total Tokens" metric card that shows the combined usage regardless of which model produced it.

3. **Daily / Weekly / All-Time periods**: Every query method accepts a period parameter (`'today' | 'week' | 'month' | 'all'`). The `daily_summary` table powers daily and all-time views. The `weekly_summary` table powers weekly views and weekly trend charts.

## Dependencies
- Task 2 (Proxy Server Core)
- Task 3 (Provider Implementations)

## Estimated Time
3-4 hours
