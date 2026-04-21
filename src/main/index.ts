import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
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

let proxyServer: ProxyServer | null = null;
let repository: UsageRepository | null = null;
let db: Database.Database | null = null;

const PROXY_PORT_MIN = 8765;
const PROXY_PORT_MAX = 8775;

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

/**
 * Try to start the proxy server, cycling through ports 8765–8775
 * on EADDRINUSE. Returns the started server or null on failure.
 */
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
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EADDRINUSE") {
        console.warn(`[ProxyServer] Port ${port} in use, trying next...`);
        continue;
      }
      console.error("[ProxyServer] Failed to start:", err);
      return null;
    }
  }
  console.error(
    `[ProxyServer] All ports ${PROXY_PORT_MIN}–${PROXY_PORT_MAX} are in use`,
  );
  return null;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.terratch.ai-usage-tracker");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize database
  db = initDatabase(app.getPath("userData"));
  repository = new UsageRepository(db);
  const pricingStore = loadPricingStore(repository);
  const costCalculator = new CostCalculator(pricingStore);
  const tokenExtractor = new TokenExtractor();
  const initialRuntimeSettings =
    resolveRuntimeSettingsFromRepository(repository);
  let runtimeSnapshot: RuntimeSettingsSnapshot =
    initialRuntimeSettings.snapshot;
  const providerRuntime = initialRuntimeSettings.providerRuntime as Partial<
    Record<string, Partial<ProviderConfig>>
  >;
  const runtimeBridge: RuntimeSettingsBridge = {
    getSnapshot: () => runtimeSnapshot,
    refreshFromRepository: () => {
      if (!repository) {
        return runtimeSnapshot;
      }
      const refreshed = resolveRuntimeSettingsFromRepository(repository);
      runtimeSnapshot = refreshed.snapshot;

      // Mutate the object in place so ProxyServer keeps a live reference.
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

  // Register all provider implementations before starting the proxy
  registerAllProviders();

  const shouldAutoStart =
    runtimeSnapshot.proxy.enabled && runtimeSnapshot.proxy.autoStart;
  let startedProxy: ProxyServer | null = null;

  // Start the proxy server with graceful degradation
  if (shouldAutoStart) {
    try {
      startedProxy = await startProxyServer({
        preferredPort: runtimeSnapshot.proxy.port,
        providerRuntime,
      });
    } catch (err) {
      console.error("[Main] Proxy server initialization failed:", err);
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

  // Notify renderer of current proxy status.
  broadcastToRenderer("proxy-status", {
    isRunning: proxyServer.isRunning,
    port: proxyServer.isRunning ? proxyServer.port : null,
  });

  // Wire proxy events to database.
  proxyServer.on("request-completed", (event: ProxyEvent) => {
    const data = event.data as ProxyCompletedEventData;
    const requestBody = data.request?.body;
    const completedAt = data.timestamp ?? new Date();
    const requestedAt = data.request?.timestamp ?? completedAt;
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
    const now = completedAt;
    const dateStr = format(now, "yyyy-MM-dd");
    const weekStartStr = format(
      startOfWeek(now, { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
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

      // Broadcast usage update to renderer so the UI can refresh
      broadcastUsageUpdate({
        providerId: providerId,
        modelId: modelId,
        totalTokens: usage.totalTokens,
        totalCost: cost.totalCost,
        period: "today",
      });
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
  });

  proxyServer.on("request-error", (event: ProxyEvent) => {
    console.error("[Main] Proxy request error:", event.data);
    // Errors are already handled by the request-completed handler above
    // (is_error flag). This handler is for network-level errors that
    // never got a response.
  });

  // Always create the window, even if proxy failed
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    try {
      await proxyServer?.stop();
    } catch (err) {
      console.error("[Main] Error stopping proxy server:", err);
    }
    if (db) {
      closeDatabase(db);
    }
    app.quit();
  }
});
