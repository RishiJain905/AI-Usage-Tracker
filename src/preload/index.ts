import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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

const api = {
  getProxyStatus: (): Promise<{ isRunning: boolean; port: number | null }> =>
    ipcRenderer.invoke("proxy:get-status"),

  getProxyPort: (): Promise<number | null> =>
    ipcRenderer.invoke("proxy:get-port"),

  // Database query methods
  dbGetUsageSummary: (period: string) =>
    ipcRenderer.invoke("db:get-usage-summary", period),
  dbGetAggregateTotal: (period: string) =>
    ipcRenderer.invoke("db:get-aggregate-total", period),
  dbGetModelBreakdown: (period: string) =>
    ipcRenderer.invoke("db:get-model-breakdown", period),
  dbGetAllModelSummaries: (period: string) =>
    ipcRenderer.invoke("db:get-all-model-summaries", period),
  dbGetTopModels: (limit: number, period: string) =>
    ipcRenderer.invoke("db:get-top-models", limit, period),
  dbGetUsageTrend: (days: number) =>
    ipcRenderer.invoke("db:get-usage-trend", days),
  dbGetWeeklyTrend: (weeks: number) =>
    ipcRenderer.invoke("db:get-weekly-trend", weeks),
  dbGetDailySummary: (start: string, end: string) =>
    ipcRenderer.invoke("db:get-daily-summary", start, end),
  dbGetWeeklySummary: (start: string, end: string) =>
    ipcRenderer.invoke("db:get-weekly-summary", start, end),
  dbGetProviderSummary: (providerId: string, period: string) =>
    ipcRenderer.invoke("db:get-provider-summary", providerId, period),
  dbGetModelSummary: (modelId: string, period: string) =>
    ipcRenderer.invoke("db:get-model-summary", modelId, period),
  dbGetUsageLogs: (filters: Record<string, unknown>) =>
    ipcRenderer.invoke("db:get-usage-logs", filters),
  dbGetTotalTokensByProvider: (period: string) =>
    ipcRenderer.invoke("db:get-total-tokens-by-provider", period),
  dbGetTotalCostByProvider: (period: string) =>
    ipcRenderer.invoke("db:get-total-cost-by-provider", period),
  dbGetTotalTokensByModel: (period: string) =>
    ipcRenderer.invoke("db:get-total-tokens-by-model", period),
  dbGetTotalCostByModel: (period: string) =>
    ipcRenderer.invoke("db:get-total-cost-by-model", period),
  dbGetAggregateDailyTotal: (date: string) =>
    ipcRenderer.invoke("db:get-aggregate-daily-total", date),
  dbGetAggregateWeeklyTotal: (weekStart: string) =>
    ipcRenderer.invoke("db:get-aggregate-weekly-total", weekStart),
  dbGetAggregateAllTimeTotal: () =>
    ipcRenderer.invoke("db:get-aggregate-all-time-total"),
  dbGetRecentLogs: (limit?: number) =>
    ipcRenderer.invoke("db:get-recent-logs", limit),
  dbGetModels: (): Promise<
    Array<{
      id: string;
      provider_id: string;
      name: string;
      input_price_per_million: number;
      output_price_per_million: number;
      is_local: number;
      provider_name: string;
    }>
  > => ipcRenderer.invoke("db:get-models"),
  dbGetSetting: (key: string) => ipcRenderer.invoke("db:get-setting", key),
  dbSetSetting: (key: string, value: string) =>
    ipcRenderer.invoke("db:set-setting", key, value),
  getRuntimeSettings: (): Promise<{
    proxy: {
      port: number;
      enabled: boolean;
      autoStart: boolean;
    };
    providers: Array<{
      providerId: string;
      providerName: string;
      baseUrl: string;
      isActive: boolean;
      authMode: "passthrough" | "inject";
      hasKey: boolean;
      keyUpdatedAt: string | null;
    }>;
  }> => ipcRenderer.invoke("settings:get-runtime"),
  updateRuntimeSettings: (payload: {
    proxy?: Partial<{
      port: number;
      enabled: boolean;
      autoStart: boolean;
    }>;
    providers?: Array<{
      providerId: string;
      baseUrl?: string;
      isActive?: boolean;
      authMode?: "passthrough" | "inject";
    }>;
  }) => ipcRenderer.invoke("settings:update-runtime", payload),
  listApiKeyMetadata: (): Promise<
    ApiKeyMetadata[]
  > => ipcRenderer.invoke("api-key:list"),
  setApiKey: (payload: {
    providerId: string;
    apiKey: string;
    authMode?: "passthrough" | "inject";
  }) => ipcRenderer.invoke("api-key:set", payload),
  deleteApiKey: (providerId: string) =>
    ipcRenderer.invoke("api-key:delete", { providerId }),
  testProviderConnection: (payload: {
    providerId: string;
    baseUrl?: string;
    apiKey?: string;
  }) => ipcRenderer.invoke("provider:test-connection", payload),
  clearDataBefore: (before: string): Promise<ClearBeforeDataResult> =>
    ipcRenderer.invoke("data:clear-before", before),
  clearAllData: (): Promise<ClearAllDataResult> =>
    ipcRenderer.invoke("data:clear-all"),
  checkForUpdates: (): Promise<CheckUpdatesResult> =>
    ipcRenderer.invoke("app:check-updates"),
  openDataDirectory: (path?: string): Promise<OpenDataDirectoryResult> =>
    ipcRenderer.invoke("app:open-data-directory", path),

  // Real-time events (Main → Renderer)
  onUsageUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) =>
      callback(data);
    ipcRenderer.on("usage-updated", handler);
    return () => ipcRenderer.removeListener("usage-updated", handler);
  },
  onProxyStatus: (
    callback: (status: { isRunning: boolean; port: number | null }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { isRunning: boolean; port: number | null },
    ) => callback(status);
    ipcRenderer.on("proxy-status", handler);
    return () => ipcRenderer.removeListener("proxy-status", handler);
  },
  onProviderError: (
    callback: (error: { providerId: string; message: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { providerId: string; message: string },
    ) => callback(error);
    ipcRenderer.on("provider-error", handler);
    return () => ipcRenderer.removeListener("provider-error", handler);
  },
  onAppCommand: (callback: (command: AppCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) =>
      callback(command);
    ipcRenderer.on("app-command", handler);
    return () => ipcRenderer.removeListener("app-command", handler);
  },

  // Proxy control
  toggleProxy: (): Promise<boolean> => ipcRenderer.invoke("proxy:toggle"),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
