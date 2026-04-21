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

type ProviderAuthMode = "passthrough" | "inject";

interface ApiKeyMetadata {
  providerId: string;
  providerName: string;
  baseUrl: string;
  isActive: boolean;
  hasKey: boolean;
  authMode: ProviderAuthMode;
  keyUpdatedAt: string | null;
  maskedPreview: string | null;
  isValid: boolean | null;
  lastValidatedAt: string | null;
}

interface ClearDataResult {
  ok: boolean;
  settingsRetained: boolean;
}

interface ClearAllDataResult extends ClearDataResult {
  usage_logs?: number;
  daily_summary?: number;
  weekly_summary?: number;
  api_keys?: number;
  error?: string;
}

interface ClearBeforeDataResult extends ClearDataResult {
  before: string;
  usageLogsDeleted?: number;
  error?: string;
}

interface CheckUpdatesResult {
  ok: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string;
}

interface OpenDataDirectoryResult {
  ok: boolean;
  path: string;
  error?: string;
}

type AppCommand =
  | "navigate-overview"
  | "navigate-providers"
  | "navigate-models"
  | "navigate-cost"
  | "navigate-history"
  | "navigate-settings"
  | "refresh"
  | "focus-history-search";

interface RuntimeProviderSettings {
  providerId: string;
  providerName: string;
  baseUrl: string;
  isActive: boolean;
  authMode: ProviderAuthMode;
  hasKey: boolean;
  keyUpdatedAt: string | null;
}

interface RuntimeSettings {
  proxy: {
    port: number;
    enabled: boolean;
    autoStart: boolean;
  };
  providers: RuntimeProviderSettings[];
}

interface RuntimeSettingsUpdate {
  proxy?: Partial<RuntimeSettings["proxy"]>;
  providers?: Array<{
    providerId: string;
    baseUrl?: string;
    isActive?: boolean;
    authMode?: ProviderAuthMode;
  }>;
}

interface ApiKeySetInput {
  providerId: string;
  apiKey: string;
  authMode?: ProviderAuthMode;
}

interface ApiKeySetResult {
  ok: boolean;
  providerId: string;
  hasKey: boolean;
  authMode?: ProviderAuthMode;
  keyUpdatedAt?: string | null;
}

interface ProviderConnectionTestInput {
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
}

interface ProviderConnectionTestResult {
  ok: boolean;
  providerId: string;
  reachable: boolean;
  authMode?: ProviderAuthMode;
  error?: string;
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

  // Database — models with pricing
  dbGetModels: () => Promise<
    Array<{
      id: string;
      provider_id: string;
      name: string;
      input_price_per_million: number;
      output_price_per_million: number;
      is_local: number;
      provider_name: string;
    }>
  >;

  // Database — recent logs
  dbGetRecentLogs: (limit?: number) => Promise<UsageLog[]>;

  // Database — settings
  dbGetSetting: (key: string) => Promise<string | null>;
  dbSetSetting: (key: string, value: string) => Promise<boolean>;
  getRuntimeSettings: () => Promise<RuntimeSettings>;
  updateRuntimeSettings: (
    payload: RuntimeSettingsUpdate,
  ) => Promise<{ ok: boolean; settings: RuntimeSettings }>;
  listApiKeyMetadata: () => Promise<ApiKeyMetadata[]>;
  setApiKey: (payload: ApiKeySetInput) => Promise<ApiKeySetResult>;
  deleteApiKey: (providerId: string) => Promise<ApiKeySetResult>;
  testProviderConnection: (
    payload: ProviderConnectionTestInput,
  ) => Promise<ProviderConnectionTestResult>;
  clearDataBefore: (before: string) => Promise<ClearBeforeDataResult>;
  clearAllData: () => Promise<ClearAllDataResult>;
  checkForUpdates: () => Promise<CheckUpdatesResult>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate: () => Promise<{ ok: boolean }>;
  openDataDirectory: (path?: string) => Promise<OpenDataDirectoryResult>;

  // Real-time events (Main → Renderer)
  onUsageUpdated: (callback: (data: unknown) => void) => () => void;
  onProxyStatus: (
    callback: (status: { isRunning: boolean; port: number | null }) => void,
  ) => () => void;
  onProviderError: (
    callback: (error: { providerId: string; message: string }) => void,
  ) => () => void;
  onAppCommand: (callback: (command: AppCommand) => void) => () => void;

  // Update events (Main → Renderer)
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: unknown }) => void,
  ) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateDownloadProgress: (
    callback: (progress: {
      bytesPerSecond: number;
      percent: number;
      transferred: number;
      total: number;
    }) => void,
  ) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;

  // Proxy control
  toggleProxy: () => Promise<boolean>;

  // Data export
  exportCsv: (options: Record<string, unknown>) => Promise<string>;
  exportJson: (options: Record<string, unknown>) => Promise<string>;
  exportHtmlReport: (options: Record<string, unknown>) => Promise<string>;
  exportSaveFile: (payload: {
    content: string;
    defaultName: string;
    format: "csv" | "json" | "html" | "png" | "svg" | "db";
  }) => Promise<{ canceled: boolean; filePath: string | null }>;
  exportChartImage: (payload: {
    data: string;
    defaultName: string;
    format: "png" | "svg";
  }) => Promise<{ canceled: boolean; filePath: string | null }>;

  // Data management
  dataBackup: () => Promise<{
    ok: boolean;
    backupPath?: string;
    error?: string;
  }>;
  dataRestore: (backupPath: string) => Promise<{
    ok: boolean;
    preRestoreBackupPath?: string;
    restartNeeded?: boolean;
    error?: string;
  }>;
  dataCleanup: (retentionDays?: number) => Promise<{
    ok: boolean;
    deletedCount: number;
    retentionDays: number;
    error?: string;
  }>;

  // ZhipuAI sync
  syncZhipuAi: (
    apiKey: string,
    since?: string,
  ) => Promise<{
    ok: boolean;
    result?: {
      providerId: string;
      importedCount: number;
      skippedCount: number;
      totalTokens: number;
      totalCost: number;
      syncRange: { start: string; end: string };
    };
    error?: string;
  }>;
  syncZhipuAiStatus: () => Promise<{ lastSyncTimestamp: string | null }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ProxyAPI;
  }
}
