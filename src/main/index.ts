import { app, shell, BrowserWindow, globalShortcut, session } from "electron";
import { join } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { format, startOfWeek } from "date-fns";
import Database from "better-sqlite3";
import { ProxyServer } from "./proxy/server";
import {
  registerProxyIpcHandlers,
  broadcastToRenderer,
  broadcastUsageUpdate,
  resolveRuntimeSettingsFromRepository,
  type RuntimeSettingsBridge,
  type RuntimeSettingsSnapshot,
} from "./ipc/handlers";
import { registerAllProviders } from "./proxy/providers";
import { initDatabase, closeDatabase } from "./database";
import { UsageRepository } from "./database/repository";
import {
  shouldRunCleanup,
  getRetentionDays,
  runCleanup,
} from "./database/cleanup";
import type {
  ProviderConfig,
  ProxyEvent,
  ProxyRequest,
  TokenUsage,
} from "./proxy/types";
import { TokenExtractor } from "./proxy/token-extractor";
import { isSSEResponse } from "./proxy/streaming";
import { CostCalculator } from "./cost/calculator";
import { InMemoryPricingStore, type ModelPricing } from "./cost/pricing";
import { PricingUpdater } from "./cost/pricing-updater";
import { syncAutoLaunchFromEnv } from "./auto-launch";
import {
  createTrayController,
  showTrayNotification,
  type TrayAggregateSummary,
  type TrayController,
  type TrayModelSummary,
  type TrayUsageSnapshot,
} from "./tray";
import { setupAutoUpdater, setUpdaterWindow } from "./updater";

const APP_SETTINGS_KEY = "app_settings";
const PROXY_PORT_MIN = 8765;
const PROXY_PORT_MAX = 8775;
const TRAY_REFRESH_INTERVAL_MS = 30_000;

type AppCommand =
  | "navigate-overview"
  | "navigate-providers"
  | "navigate-models"
  | "navigate-cost"
  | "navigate-history"
  | "navigate-settings"
  | "refresh"
  | "focus-history-search";

interface StoredProxySettings {
  enabled?: boolean;
}

interface StoredBudgetSettings {
  monthlyBudget?: number;
  alertThreshold?: number;
  notificationsEnabled?: boolean;
}

interface StoredAppSettings {
  proxy?: StoredProxySettings;
  budget?: StoredBudgetSettings;
}

interface StartProxyServerOptions {
  preferredPort?: number;
  providerRuntime?: Partial<Record<string, Partial<ProviderConfig>>>;
}

type ProxyCompletedEventData = ProxyRequest & {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  usage?: TokenUsage;
  timestamp: Date;
  request?: ProxyRequest;
};

type ProxyErrorEventData = ProxyRequest & {
  error?: string;
};

let proxyServer: ProxyServer | null = null;
let repository: UsageRepository | null = null;
let db: Database.Database | null = null;
let mainWindow: BrowserWindow | null = null;
let trayController: TrayController | null = null;
let trayRefreshTimer: NodeJS.Timeout | null = null;
let dailyCleanupTimer: NodeJS.Timeout | null = null;
let proxyEventCleanup: (() => void) | null = null;
let runtimeSnapshot: RuntimeSettingsSnapshot | null = null;
let runtimeBridge: RuntimeSettingsBridge | null = null;
let quitRequested = false;
let notifiedFirstRequestDate: string | null = null;
let notifiedBudgetMonth: string | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDefaultRuntimeSnapshot(): RuntimeSettingsSnapshot {
  return {
    proxy: {
      port: PROXY_PORT_MIN,
      enabled: true,
      autoStart: true,
    },
    providers: [],
  };
}

function loadPricingStore(repo: UsageRepository): InMemoryPricingStore {
  const store = new InMemoryPricingStore();
  const updater = new PricingUpdater(store);
  const rawOverrides = repo.getSetting("pricing_overrides");
  const rawLastUpdated = repo.getSetting("last_pricing_update");

  if (rawOverrides) {
    try {
      const overrides = JSON.parse(rawOverrides) as Array<
        Partial<ModelPricing> & Pick<ModelPricing, "providerId" | "modelId">
      >;
      for (const override of overrides) {
        updater.update(override);
      }
    } catch (error) {
      console.warn("[Pricing] Failed to parse pricing overrides:", error);
    }
  }

  if (rawLastUpdated) {
    const parsed = new Date(rawLastUpdated);
    if (!Number.isNaN(parsed.getTime())) {
      store.markUpdated(parsed);
    }
  }

  return store;
}

async function startProxyServer(
  options: StartProxyServerOptions = {},
): Promise<ProxyServer | null> {
  const candidatePorts: number[] = [];

  if (
    typeof options.preferredPort === "number" &&
    Number.isInteger(options.preferredPort) &&
    options.preferredPort >= 1024 &&
    options.preferredPort <= 65535
  ) {
    candidatePorts.push(options.preferredPort);
  }

  for (let port = PROXY_PORT_MIN; port <= PROXY_PORT_MAX; port++) {
    if (!candidatePorts.includes(port)) {
      candidatePorts.push(port);
    }
  }

  for (const port of candidatePorts) {
    const server = new ProxyServer({
      port,
      providers: options.providerRuntime,
    });

    try {
      await server.start();
      console.log(`[ProxyServer] Started on port ${server.port}`);
      return server;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "EADDRINUSE") {
        console.warn(`[ProxyServer] Port ${port} in use, trying next...`);
        continue;
      }

      console.error("[ProxyServer] Failed to start:", error);
      return null;
    }
  }

  console.error(
    `[ProxyServer] All ports ${PROXY_PORT_MIN}-${PROXY_PORT_MAX} are in use`,
  );
  return null;
}

function updateProxyStatusBroadcast(): void {
  broadcastToRenderer("proxy-status", {
    isRunning: proxyServer?.isRunning ?? false,
    port: proxyServer?.isRunning ? proxyServer.port : null,
  });
}

function sendAppCommand(command: AppCommand): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("app-command", command);
}

function registerInAppShortcutBridge(window: BrowserWindow): void {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }

    const hasCmdOrCtrl = input.control || input.meta;
    if (!hasCmdOrCtrl || input.alt || input.shift) {
      return;
    }

    const key = (input.key ?? "").toLowerCase();
    let command: AppCommand | null = null;

    switch (key) {
      case "1":
        command = "navigate-overview";
        break;
      case "2":
        command = "navigate-providers";
        break;
      case "3":
        command = "navigate-models";
        break;
      case "4":
        command = "navigate-cost";
        break;
      case "5":
        command = "navigate-history";
        break;
      case ",":
        command = "navigate-settings";
        break;
      case "r":
        command = "refresh";
        break;
      case "f":
        command = "focus-history-search";
        break;
      default:
        command = null;
    }

    if (!command) {
      return;
    }

    event.preventDefault();
    sendAppCommand(command);
  });
}

function createWindow(showOnReady = true): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  registerInAppShortcutBridge(window);

  window.on("ready-to-show", () => {
    if (showOnReady && !quitRequested) {
      window.show();
      window.focus();
    }
  });

  window.on("close", (event) => {
    if (quitRequested) {
      return;
    }

    event.preventDefault();
    window.hide();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow = window;
  return window;
}

function showMainWindow(): void {
  if (quitRequested) {
    return;
  }

  const window = createWindow(false);
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

function toggleMainWindowVisibility(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    showMainWindow();
    return;
  }

  mainWindow.hide();
}

function parseStoredAppSettings(raw: string | null): StoredAppSettings {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as StoredAppSettings) : {};
  } catch {
    return {};
  }
}

function persistProxyEnabled(enabled: boolean): void {
  if (!repository) {
    return;
  }

  const current = parseStoredAppSettings(
    repository.getSetting(APP_SETTINGS_KEY),
  );
  const next: StoredAppSettings = {
    ...current,
    proxy: {
      ...(isRecord(current.proxy) ? current.proxy : {}),
      enabled,
    },
  };

  repository.setSetting(APP_SETTINGS_KEY, JSON.stringify(next));
  runtimeSnapshot = runtimeBridge?.refreshFromRepository() ?? runtimeSnapshot;
}

function getBudgetSettings(): {
  monthlyBudget: number;
  alertThreshold: number;
  notificationsEnabled: boolean;
} {
  if (!repository) {
    return {
      monthlyBudget: 0,
      alertThreshold: 80,
      notificationsEnabled: true,
    };
  }

  const current = parseStoredAppSettings(
    repository.getSetting(APP_SETTINGS_KEY),
  );
  const budget = isRecord(current.budget)
    ? (current.budget as StoredBudgetSettings)
    : {};

  return {
    monthlyBudget:
      typeof budget.monthlyBudget === "number" &&
      Number.isFinite(budget.monthlyBudget)
        ? budget.monthlyBudget
        : 0,
    alertThreshold:
      typeof budget.alertThreshold === "number" &&
      Number.isFinite(budget.alertThreshold)
        ? budget.alertThreshold
        : 80,
    notificationsEnabled:
      typeof budget.notificationsEnabled === "boolean"
        ? budget.notificationsEnabled
        : true,
  };
}

function toTrayAggregate(
  total: {
    total_tokens?: number;
    total_cost?: number;
    request_count?: number;
  } | null,
): TrayAggregateSummary {
  return {
    totalTokens: total?.total_tokens ?? 0,
    totalCost: total?.total_cost ?? 0,
    requestCount: total?.request_count ?? 0,
  };
}

function toTrayModel(model: {
  model_id: string;
  model_name: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}): TrayModelSummary {
  return {
    modelId: model.model_id,
    modelName: model.model_name,
    totalTokens: model.total_tokens,
    totalCost: model.total_cost,
    requestCount: model.request_count,
  };
}

function buildTraySnapshot(): TrayUsageSnapshot {
  const today = repository?.getAggregateTotal("today") ?? null;
  const week = repository?.getAggregateTotal("week") ?? null;
  const all = repository?.getAggregateTotal("all") ?? null;
  const topModels = (repository?.getTopModels(3, "today") ?? []).map(
    toTrayModel,
  );

  return {
    today: toTrayAggregate(today),
    topModelsToday: topModels,
    week: toTrayAggregate(week),
    allTime: toTrayAggregate(all),
    proxy: {
      isRunning: proxyServer?.isRunning ?? false,
      port: proxyServer?.isRunning ? proxyServer.port : null,
    },
  };
}

function refreshTraySnapshot(): void {
  if (!trayController) {
    return;
  }

  trayController.update(buildTraySnapshot());
}

function notifyProxyStateChanged(isRunning: boolean): void {
  showTrayNotification({
    title: isRunning ? "Proxy started" : "Proxy stopped",
    body: isRunning
      ? `Proxy is listening on 127.0.0.1:${proxyServer?.port ?? "unknown"}.`
      : "Proxy is no longer listening.",
  });
}

function notifyFirstRequestOfDay(providerId: string, modelId: string): void {
  showTrayNotification({
    title: "First request of the day",
    body: `First tracked request today: ${providerId} / ${modelId}.`,
  });
}

function notifyBudgetThreshold(totalCost: number, monthlyBudget: number): void {
  const percentage = monthlyBudget > 0 ? (totalCost / monthlyBudget) * 100 : 0;

  showTrayNotification({
    title: "Monthly budget threshold reached",
    body: `Usage is ${percentage.toFixed(1)}% of monthly budget ($${totalCost.toFixed(2)} / $${monthlyBudget.toFixed(2)}).`,
  });
}

function notifyProviderConnectionError(
  providerId: string,
  message: string,
): void {
  showTrayNotification({
    title: "Provider connection error",
    body: `${providerId}: ${message}`,
  });
}

async function setProxyRunningState(
  shouldRun: boolean,
  options: {
    notify: boolean;
    persistEnabledState: boolean;
  },
): Promise<boolean> {
  if (!proxyServer) {
    return false;
  }

  if (proxyServer.isRunning === shouldRun) {
    updateProxyStatusBroadcast();
    refreshTraySnapshot();
    return proxyServer.isRunning;
  }

  try {
    if (shouldRun) {
      await proxyServer.start();
    } else {
      await proxyServer.stop();
    }
  } catch (error) {
    console.error("[Main] Failed to change proxy state:", error);
  }

  if (options.persistEnabledState) {
    persistProxyEnabled(proxyServer.isRunning);
  }

  updateProxyStatusBroadcast();
  refreshTraySnapshot();

  if (options.notify) {
    notifyProxyStateChanged(proxyServer.isRunning);
  }

  return proxyServer.isRunning;
}

function clearTrayRefreshTimer(): void {
  if (!trayRefreshTimer) {
    return;
  }

  clearInterval(trayRefreshTimer);
  trayRefreshTimer = null;
}

function clearDailyCleanupTimer(): void {
  if (!dailyCleanupTimer) {
    return;
  }

  clearInterval(dailyCleanupTimer);
  dailyCleanupTimer = null;
}

function startTrayRefreshTimer(): void {
  clearTrayRefreshTimer();
  trayRefreshTimer = setInterval(() => {
    refreshTraySnapshot();
  }, TRAY_REFRESH_INTERVAL_MS);
}

function hasAnyRequestsForDate(dateStr: string): boolean {
  if (!repository) {
    return false;
  }

  return repository.getAggregateDailyTotal(dateStr).request_count > 0;
}

function maybeNotifyBudgetThreshold(now: Date): void {
  if (!repository) {
    return;
  }

  const budgetSettings = getBudgetSettings();
  if (
    !budgetSettings.notificationsEnabled ||
    budgetSettings.monthlyBudget <= 0 ||
    budgetSettings.alertThreshold <= 0
  ) {
    return;
  }

  const monthKey = format(now, "yyyy-MM");
  if (notifiedBudgetMonth && notifiedBudgetMonth !== monthKey) {
    notifiedBudgetMonth = null;
  }

  const monthTotalCost = repository.getAggregateTotal("month").total_cost;
  const thresholdCost =
    budgetSettings.monthlyBudget * (budgetSettings.alertThreshold / 100);

  if (monthTotalCost >= thresholdCost && notifiedBudgetMonth !== monthKey) {
    notifiedBudgetMonth = monthKey;
    notifyBudgetThreshold(monthTotalCost, budgetSettings.monthlyBudget);
  }
}

function attachProxyEventListeners(
  tokenExtractor: TokenExtractor,
  costCalculator: CostCalculator,
): void {
  if (!proxyServer) {
    return;
  }

  const handleRequestCompleted = (event: ProxyEvent): void => {
    const data = event.data as ProxyCompletedEventData;
    const requestBody = data.request?.body;
    const completedAt = data.timestamp ?? new Date();
    const requestedAt = data.request?.timestamp ?? completedAt;
    const dateStr = format(completedAt, "yyyy-MM-dd");
    const weekStartStr = format(
      startOfWeek(completedAt, { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    const wasFirstRequestToday =
      notifiedFirstRequestDate !== dateStr && !hasAnyRequestsForDate(dateStr);

    const isStreaming =
      isSSEResponse(data.headers ?? {}) || typeof data.body === "string";

    const extractedUsage = isStreaming
      ? tokenExtractor.extractStream({
          providerId: data.provider,
          modelId: data.model,
          requestBody,
          body: typeof data.body === "string" ? data.body : "",
        })
      : tokenExtractor.extractBuffered({
          providerId: data.provider,
          modelId: data.model,
          requestBody,
          responseBody: data.body,
        });

    const usage = extractedUsage ?? data.usage;
    const isError = data.statusCode >= 400;
    const requestDurationMs = Math.max(
      0,
      completedAt.getTime() - requestedAt.getTime(),
    );

    if (usage && repository) {
      const modelId = usage.modelId || data.model || "unknown";
      const providerId = usage.providerId || data.provider || "unknown";
      const cost = costCalculator.calculate(usage);

      repository.insertUsageLog({
        provider_id: providerId,
        model_id: modelId,
        endpoint: data.endpoint,
        method: data.method,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        input_cost: cost.inputCost,
        output_cost: cost.outputCost,
        total_cost: cost.totalCost,
        request_duration_ms: requestDurationMs,
        is_streaming: isStreaming,
        is_error: isError,
        error_message: isError ? `Upstream returned ${data.statusCode}` : null,
        is_estimated: usage.isEstimated ?? false,
        estimation_source: usage.estimationSource ?? null,
        pricing_source:
          cost.pricingSource === "missing" ? null : cost.pricingSource,
        cached_read_tokens: usage.cachedReadTokens ?? 0,
        cached_write_tokens: usage.cachedWriteTokens ?? 0,
        image_tokens: usage.imageTokens ?? 0,
        audio_tokens: usage.audioTokens ?? 0,
        reasoning_tokens: usage.reasoningTokens ?? 0,
        image_count: usage.imageCount ?? 0,
        estimated_request_count: usage.isEstimated ? 1 : 0,
        requested_at: requestedAt.toISOString(),
        completed_at: completedAt.toISOString(),
      });

      repository.upsertDailySummary(dateStr, providerId, modelId, {
        request_count: 1,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        input_cost: cost.inputCost,
        output_cost: cost.outputCost,
        total_cost: cost.totalCost,
        error_count: isError ? 1 : 0,
        avg_duration_ms: requestDurationMs,
        estimated_request_count: usage.isEstimated ? 1 : 0,
        cached_read_tokens: usage.cachedReadTokens ?? 0,
        cached_write_tokens: usage.cachedWriteTokens ?? 0,
        image_tokens: usage.imageTokens ?? 0,
        audio_tokens: usage.audioTokens ?? 0,
        reasoning_tokens: usage.reasoningTokens ?? 0,
        image_count: usage.imageCount ?? 0,
      });

      repository.upsertWeeklySummary(weekStartStr, providerId, modelId, {
        request_count: 1,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        input_cost: cost.inputCost,
        output_cost: cost.outputCost,
        total_cost: cost.totalCost,
        error_count: isError ? 1 : 0,
        avg_duration_ms: requestDurationMs,
        estimated_request_count: usage.isEstimated ? 1 : 0,
        cached_read_tokens: usage.cachedReadTokens ?? 0,
        cached_write_tokens: usage.cachedWriteTokens ?? 0,
        image_tokens: usage.imageTokens ?? 0,
        audio_tokens: usage.audioTokens ?? 0,
        reasoning_tokens: usage.reasoningTokens ?? 0,
        image_count: usage.imageCount ?? 0,
      });

      broadcastUsageUpdate({
        providerId,
        modelId,
        totalTokens: usage.totalTokens,
        totalCost: cost.totalCost,
        period: "today",
      });

      if (wasFirstRequestToday) {
        notifiedFirstRequestDate = dateStr;
        notifyFirstRequestOfDay(providerId, modelId);
      }

      maybeNotifyBudgetThreshold(completedAt);
    } else if (repository) {
      repository.insertUsageLog({
        provider_id: data.provider ?? "unknown",
        model_id: data.model || "unknown",
        endpoint: data.endpoint,
        method: data.method,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        total_cost: 0,
        request_duration_ms: requestDurationMs,
        is_streaming: isStreaming,
        is_error: isError,
        error_message: isError
          ? "No usage data extracted from errored response"
          : null,
        requested_at: requestedAt.toISOString(),
        completed_at: completedAt.toISOString(),
      });
    }

    refreshTraySnapshot();
  };

  const handleRequestError = (event: ProxyEvent): void => {
    const data = event.data as ProxyErrorEventData;
    const providerId = data.provider || "unknown";
    const message =
      typeof data.error === "string" && data.error.length > 0
        ? data.error
        : "Unknown connection error";

    console.error("[Main] Proxy request error:", data);
    notifyProviderConnectionError(providerId, message);
    refreshTraySnapshot();
  };

  proxyServer.on("request-completed", handleRequestCompleted);
  proxyServer.on("request-error", handleRequestError);

  proxyEventCleanup = () => {
    proxyServer?.off("request-completed", handleRequestCompleted);
    proxyServer?.off("request-error", handleRequestError);
  };
}

async function requestAppQuit(): Promise<void> {
  if (quitRequested) {
    return;
  }

  quitRequested = true;
  clearTrayRefreshTimer();
  clearDailyCleanupTimer();
  globalShortcut.unregisterAll();

  if (proxyEventCleanup) {
    proxyEventCleanup();
    proxyEventCleanup = null;
  }

  if (trayController) {
    trayController.dispose();
    trayController = null;
  }

  if (proxyServer?.isRunning) {
    try {
      await proxyServer.stop();
    } catch (error) {
      console.error("[Main] Error stopping proxy server:", error);
    }
  }

  if (db) {
    closeDatabase(db);
    db = null;
    repository = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }

  app.quit();
}

function registerGlobalShortcuts(): void {
  const register = (accelerator: string, handler: () => void): void => {
    const ok = globalShortcut.register(accelerator, handler);
    if (!ok) {
      console.warn(`[Main] Failed to register global shortcut: ${accelerator}`);
    }
  };

  register("CommandOrControl+Shift+A", () => {
    toggleMainWindowVisibility();
  });

  register("CommandOrControl+Shift+P", () => {
    void setProxyRunningState(!(proxyServer?.isRunning ?? false), {
      notify: true,
      persistEnabledState: true,
    });
  });
}

async function initializeApp(): Promise<void> {
  electronApp.setAppUserModelId("com.terratch.ai-usage-tracker");

  app.setAboutPanelOptions({
    applicationName: "AI Usage Tracker",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2024 TerraWatch",
    authors: ["TerraWatch"],
    website: "https://github.com/terratch/ai-usage-tracker",
  });

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  db = initDatabase(app.getPath("userData"));
  repository = new UsageRepository(db);

  // Run scheduled cleanup on startup if auto-cleanup is enabled
  if (shouldRunCleanup(repository)) {
    try {
      const retentionDays = getRetentionDays(repository);
      const deletedCount = runCleanup(repository, retentionDays);
      if (deletedCount > 0) {
        console.info(
          `[Main] Auto-cleanup removed ${deletedCount} old usage log(s).`,
        );
      }
    } catch (cleanupError) {
      console.error("[Main] Auto-cleanup failed:", cleanupError);
    }
  }

  const pricingStore = loadPricingStore(repository);
  const costCalculator = new CostCalculator(pricingStore);
  const tokenExtractor = new TokenExtractor();

  const initialRuntimeSettings =
    resolveRuntimeSettingsFromRepository(repository);
  runtimeSnapshot = initialRuntimeSettings.snapshot;
  const providerRuntime: Partial<Record<string, Partial<ProviderConfig>>> =
    initialRuntimeSettings.providerRuntime as Partial<
      Record<string, Partial<ProviderConfig>>
    >;

  runtimeBridge = {
    getSnapshot: () => runtimeSnapshot ?? createDefaultRuntimeSnapshot(),
    refreshFromRepository: () => {
      if (!repository) {
        return runtimeSnapshot ?? createDefaultRuntimeSnapshot();
      }

      const refreshed = resolveRuntimeSettingsFromRepository(repository);
      runtimeSnapshot = refreshed.snapshot;

      for (const key of Object.keys(providerRuntime)) {
        delete providerRuntime[key];
      }

      for (const [providerId, config] of Object.entries(
        refreshed.providerRuntime,
      )) {
        providerRuntime[providerId] = config;
      }

      return runtimeSnapshot;
    },
  };

  registerAllProviders();

  // Configure Content-Security-Policy response headers before window creation
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
        ],
      },
    });
  });

  const autoLaunchEnabled = syncAutoLaunchFromEnv();
  createWindow(!autoLaunchEnabled);
  setUpdaterWindow(mainWindow);

  const shouldAutoStart =
    runtimeSnapshot.proxy.enabled && runtimeSnapshot.proxy.autoStart;
  let startedProxy: ProxyServer | null = null;

  if (shouldAutoStart) {
    try {
      startedProxy = await startProxyServer({
        preferredPort: runtimeSnapshot.proxy.port,
        providerRuntime,
      });
    } catch (error) {
      console.error("[Main] Proxy server initialization failed:", error);
    }
  } else {
    console.info(
      "[Main] Proxy auto-start disabled by runtime settings; starting in standby mode.",
    );
  }

  proxyServer =
    startedProxy ??
    new ProxyServer({
      port: runtimeSnapshot.proxy.port,
      providers: providerRuntime,
    });

  registerProxyIpcHandlers(proxyServer, repository, runtimeBridge);
  updateProxyStatusBroadcast();

  trayController = createTrayController({
    onRestoreWindow: () => {
      showMainWindow();
    },
    onShowDashboard: () => {
      showMainWindow();
    },
    onStartProxy: async () => {
      await setProxyRunningState(true, {
        notify: true,
        persistEnabledState: true,
      });
    },
    onStopProxy: async () => {
      await setProxyRunningState(false, {
        notify: true,
        persistEnabledState: true,
      });
    },
    onQuit: async () => {
      await requestAppQuit();
    },
  });

  refreshTraySnapshot();
  startTrayRefreshTimer();

  // Schedule daily cleanup (runs every 24 hours if auto-cleanup is enabled)
  dailyCleanupTimer = setInterval(
    () => {
      if (repository && shouldRunCleanup(repository)) {
        try {
          const retentionDays = getRetentionDays(repository);
          const deletedCount = runCleanup(repository, retentionDays);
          if (deletedCount > 0) {
            console.info(
              `[Main] Daily cleanup removed ${deletedCount} old usage log(s).`,
            );
          }
        } catch (cleanupError) {
          console.error("[Main] Daily cleanup failed:", cleanupError);
        }
      }
    },
    24 * 60 * 60 * 1000,
  );

  attachProxyEventListeners(tokenExtractor, costCalculator);

  registerGlobalShortcuts();

  setupAutoUpdater();

  app.on("activate", () => {
    showMainWindow();
  });

  app.on("before-quit", (event) => {
    if (!quitRequested) {
      event.preventDefault();
      void requestAppQuit();
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    void initializeApp().catch((error) => {
      console.error("[Main] Failed to initialize app:", error);
    });
  });
}
