// Period types
export type Period = "today" | "week" | "month" | "all";

// Aggregate totals
export interface AggregateTotal {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  request_count: number;
  estimated_request_count: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  image_tokens: number;
  audio_tokens: number;
  reasoning_tokens: number;
  image_count: number;
}

// Per-model breakdown
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

// Model usage summary (for top models)
export interface ModelUsage {
  model_id: string;
  model_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

// Usage summary
export interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  unique_models: number;
  unique_providers: number;
  period: Period;
}

// Daily/Weekly trends
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

// Provider summary
export interface ProviderSummary {
  provider_id: string;
  provider_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
  model_count: number;
}

// Usage log
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
  is_estimated: boolean;
  estimation_source: string | null;
  pricing_source: string | null;
  cached_read_tokens: number;
  cached_write_tokens: number;
  image_tokens: number;
  audio_tokens: number;
  reasoning_tokens: number;
  image_count: number;
  estimated_request_count: number;
  requested_at: string;
  completed_at: string | null;
  created_at: string;
}

// Usage filters
export interface UsageFilters {
  providerId?: string;
  providerIds?: string[];
  modelId?: string;
  modelIds?: string[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// Daily/Weekly summary
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
  estimated_request_count: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  image_tokens: number;
  audio_tokens: number;
  reasoning_tokens: number;
  image_count: number;
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
  estimated_request_count: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  image_tokens: number;
  audio_tokens: number;
  reasoning_tokens: number;
  image_count: number;
}

// Per-model daily trends (keyed by model ID)
export type ModelDailyTrends = Record<string, DailyTrend[]>;

// Provider detail with per-model breakdown
export interface ProviderDetail extends ProviderSummary {
  models: ModelBreakdown[];
  avgLatencyMs: number;
  errorRate: number;
}

// Model comparison row (for the comparison table)
export interface ModelComparisonRow {
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  input_price_per_million: number;
  output_price_per_million: number;
  total_tokens: number;
  total_cost: number;
  request_count: number;
  share_of_total: number;
}

// Proxy status
export interface ProxyStatus {
  isRunning: boolean;
  port: number | null;
}
