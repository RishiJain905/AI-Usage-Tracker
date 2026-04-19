import { ElectronAPI } from "@electron-toolkit/preload";

// Re-export database types for use in renderer via IPC
type Period = "today" | "week" | "month" | "all";

interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  unique_models: number;
  unique_providers: number;
  period: Period;
}

interface AggregateTotal {
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

interface ModelBreakdown {
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

interface ModelUsage {
  model_id: string;
  model_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

interface DailyTrend {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

interface WeeklyTrend {
  week_start: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

interface ProviderSummary {
  provider_id: string;
  provider_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
  model_count: number;
}

interface UsageLog {
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

interface UsageFilters {
  providerId?: string;
  modelId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface DailySummary {
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

interface WeeklySummary {
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

interface ProxyAPI {
  // Proxy status
  getProxyStatus: () => Promise<{ isRunning: boolean; port: number | null }>;
  getProxyPort: () => Promise<number | null>;

  // Database — usage summary
  dbGetUsageSummary: (period: Period) => Promise<UsageSummary>;
  dbGetAggregateTotal: (period: Period) => Promise<AggregateTotal>;
  dbGetModelBreakdown: (period: Period) => Promise<ModelBreakdown[]>;
  dbGetAllModelSummaries: (period: Period) => Promise<ModelBreakdown[]>;
  dbGetTopModels: (limit: number, period: Period) => Promise<ModelUsage[]>;

  // Database — trends
  dbGetUsageTrend: (days: number) => Promise<DailyTrend[]>;
  dbGetWeeklyTrend: (weeks: number) => Promise<WeeklyTrend[]>;

  // Database — summaries by date range
  dbGetDailySummary: (start: string, end: string) => Promise<DailySummary[]>;
  dbGetWeeklySummary: (start: string, end: string) => Promise<WeeklySummary[]>;

  // Database — per-provider / per-model
  dbGetProviderSummary: (
    providerId: string,
    period: Period,
  ) => Promise<ProviderSummary>;
  dbGetModelSummary: (
    modelId: string,
    period: Period,
  ) => Promise<ModelBreakdown>;

  // Database — usage logs
  dbGetUsageLogs: (filters: UsageFilters) => Promise<UsageLog[]>;

  // Database — aggregations
  dbGetTotalTokensByProvider: (
    period: Period,
  ) => Promise<Record<string, number>>;
  dbGetTotalCostByProvider: (period: Period) => Promise<Record<string, number>>;
  dbGetTotalTokensByModel: (period: Period) => Promise<Record<string, number>>;
  dbGetTotalCostByModel: (period: Period) => Promise<Record<string, number>>;

  // Database — aggregate totals by period
  dbGetAggregateDailyTotal: (date: string) => Promise<AggregateTotal>;
  dbGetAggregateWeeklyTotal: (weekStart: string) => Promise<AggregateTotal>;
  dbGetAggregateAllTimeTotal: () => Promise<AggregateTotal>;

  // Database — settings
  dbGetSetting: (key: string) => Promise<string | null>;
  dbSetSetting: (key: string, value: string) => Promise<boolean>;

  // Real-time events (Main → Renderer)
  onUsageUpdated: (callback: (data: unknown) => void) => () => void;
  onProxyStatus: (
    callback: (status: { isRunning: boolean; port: number | null }) => void,
  ) => () => void;
  onProviderError: (
    callback: (error: { providerId: string; message: string }) => void,
  ) => () => void;

  // Proxy control
  toggleProxy: () => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ProxyAPI;
  }
}
