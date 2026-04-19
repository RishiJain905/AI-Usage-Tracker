import { ipcMain } from "electron";
import type { ProxyServer } from "../proxy/server";
import type { ProxyStatus } from "../proxy/types";
import type { UsageRepository } from "../database/repository";
import type { Period } from "../database/types";

let proxyServer: ProxyServer | null = null;
let repository: UsageRepository | null = null;

/**
 * Register IPC handlers for proxy server communication and database queries.
 * Called from index.ts after the proxy server instance is created.
 */
export function registerProxyIpcHandlers(
  server: ProxyServer,
  repo: UsageRepository,
): void {
  proxyServer = server;
  repository = repo;

  // ---------------------------------------------------------------------------
  // Proxy status handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "proxy:get-status",
    (): ProxyStatus => ({
      isRunning: proxyServer?.isRunning ?? false,
      port: proxyServer?.port ?? null,
    }),
  );

  ipcMain.handle(
    "proxy:get-port",
    (): number | null => proxyServer?.port ?? null,
  );

  // ---------------------------------------------------------------------------
  // Database query handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:get-usage-summary", (_event, period: Period) => {
    return repository?.getUsageSummary(period);
  });

  ipcMain.handle("db:get-aggregate-total", (_event, period: Period) => {
    return repository?.getAggregateTotal(period);
  });

  ipcMain.handle("db:get-model-breakdown", (_event, period: Period) => {
    return repository?.getModelBreakdownForPeriod(period);
  });

  ipcMain.handle("db:get-all-model-summaries", (_event, period: Period) => {
    return repository?.getAllModelSummaries(period);
  });

  ipcMain.handle(
    "db:get-top-models",
    (_event, limit: number, period: Period) => {
      return repository?.getTopModels(limit, period);
    },
  );

  ipcMain.handle("db:get-usage-trend", (_event, days: number) => {
    return repository?.getUsageTrend(days);
  });

  ipcMain.handle("db:get-weekly-trend", (_event, weeks: number) => {
    return repository?.getWeeklyTrend(weeks);
  });

  ipcMain.handle(
    "db:get-daily-summary",
    (_event, start: string, end: string) => {
      return repository?.getDailySummary({ start, end });
    },
  );

  ipcMain.handle(
    "db:get-weekly-summary",
    (_event, start: string, end: string) => {
      return repository?.getWeeklySummary({ start, end });
    },
  );

  ipcMain.handle(
    "db:get-provider-summary",
    (_event, providerId: string, period: Period) => {
      return repository?.getProviderSummary(providerId, period);
    },
  );

  ipcMain.handle(
    "db:get-model-summary",
    (_event, modelId: string, period: Period) => {
      return repository?.getModelSummary(modelId, period);
    },
  );

  ipcMain.handle(
    "db:get-usage-logs",
    (
      _event,
      filters: Parameters<UsageRepository["getUsageLogs"]>[0],
    ) => {
      return repository?.getUsageLogs(filters);
    },
  );

  ipcMain.handle(
    "db:get-total-tokens-by-provider",
    (_event, period: Period) => {
      return repository?.getTotalTokensByProvider(period);
    },
  );

  ipcMain.handle(
    "db:get-total-cost-by-provider",
    (_event, period: Period) => {
      return repository?.getTotalCostByProvider(period);
    },
  );

  ipcMain.handle(
    "db:get-total-tokens-by-model",
    (_event, period: Period) => {
      return repository?.getTotalTokensByModel(period);
    },
  );

  ipcMain.handle("db:get-total-cost-by-model", (_event, period: Period) => {
    return repository?.getTotalCostByModel(period);
  });

  ipcMain.handle("db:get-aggregate-daily-total", (_event, date: string) => {
    return repository?.getAggregateDailyTotal(date);
  });

  ipcMain.handle(
    "db:get-aggregate-weekly-total",
    (_event, weekStart: string) => {
      return repository?.getAggregateWeeklyTotal(weekStart);
    },
  );

  ipcMain.handle("db:get-aggregate-all-time-total", () => {
    return repository?.getAggregateAllTimeTotal();
  });

  ipcMain.handle("db:get-setting", (_event, key: string) => {
    return repository?.getSetting(key);
  });

  ipcMain.handle("db:set-setting", (_event, key: string, value: string) => {
    repository?.setSetting(key, value);
    return true;
  });
}
