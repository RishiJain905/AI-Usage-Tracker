import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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
  dbGetSetting: (key: string) => ipcRenderer.invoke("db:get-setting", key),
  dbSetSetting: (key: string, value: string) =>
    ipcRenderer.invoke("db:set-setting", key, value),

  // Real-time events (Main → Renderer)
  onUsageUpdated: (callback: (data: unknown) => void) => {
    ipcRenderer.on("usage-updated", (_event, data) => callback(data));
    return () =>
      ipcRenderer.removeListener("usage-updated", (_event, data) =>
        callback(data),
      );
  },
  onProxyStatus: (
    callback: (status: { isRunning: boolean; port: number | null }) => void,
  ) => {
    ipcRenderer.on("proxy-status", (_event, status) => callback(status));
    return () => ipcRenderer.removeListener("proxy-status", () => {});
  },
  onProviderError: (
    callback: (error: { providerId: string; message: string }) => void,
  ) => {
    ipcRenderer.on("provider-error", (_event, error) => callback(error));
    return () => ipcRenderer.removeListener("provider-error", () => {});
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
