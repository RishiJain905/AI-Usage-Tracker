// Database types — table interfaces, query parameter types, and result types

// ---------------------------------------------------------------------------
// Table interfaces (match SQL schema exactly)
// ---------------------------------------------------------------------------

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Model {
  id: string;
  provider_id: string;
  name: string;
  input_price_per_million: number;
  output_price_per_million: number;
  is_local: boolean;
  created_at: string;
}

export interface UsageLog {
  id: string;
  provider_id: string;
  model_id: string;
  endpoint: string | null;
  method: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_duration_ms: number | null;
  is_streaming: boolean;
  is_error: boolean;
  error_message: string | null;
  app_name: string | null;
  tags: string | null;
  source: string;
  requested_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface DailySummary {
  id: string;
  date: string;
  provider_id: string;
  model_id: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  error_count: number;
  avg_duration_ms: number;
}

export interface WeeklySummary {
  id: string;
  week_start: string;
  provider_id: string;
  model_id: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  error_count: number;
  avg_duration_ms: number;
}

export interface SettingsRecord {
  key: string;
  value: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  provider_id: string;
  encrypted_key: string;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query / input types
// ---------------------------------------------------------------------------

export type Period = "today" | "week" | "month" | "all";

export interface UsageFilters {
  providerId?: string;
  modelId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface InsertUsageLogInput {
  provider_id: string;
  model_id: string;
  endpoint?: string;
  method?: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_duration_ms?: number | null;
  is_streaming?: boolean;
  is_error?: boolean;
  error_message?: string | null;
  app_name?: string | null;
  tags?: string | null;
  source?: string;
  requested_at: string;
  completed_at?: string | null;
}

export interface UpsertSummaryInput {
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  error_count?: number;
  avg_duration_ms?: number;
}

// ---------------------------------------------------------------------------
// Result / aggregate types
// ---------------------------------------------------------------------------

export interface AggregateTotal {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_count: number;
}

export interface ModelBreakdown {
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_count: number;
}

export interface ModelUsage {
  model_id: string;
  model_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface DailyTrend {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface WeeklyTrend {
  week_start: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface ProviderSummary {
  provider_id: string;
  provider_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
  model_count: number;
}

export interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  unique_models: number;
  unique_providers: number;
  period: Period;
}

// ---------------------------------------------------------------------------
// Seed data types
// ---------------------------------------------------------------------------

export interface SeedProvider {
  id: string;
  name: string;
  baseUrl: string;
  icon: string;
}

export interface SeedModel {
  id: string;
  providerId: string;
  name: string;
  inputPrice: number;
  outputPrice: number;
  isLocal?: boolean;
}
