import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { format, startOfWeek } from "date-fns";
import Database from "better-sqlite3";
import { ProxyServer } from "./proxy/server";
import { registerProxyIpcHandlers } from "./ipc/handlers";
import { registerAllProviders } from "./proxy/providers";
import { initDatabase, closeDatabase } from "./database";
import { UsageRepository } from "./database/repository";
import type { ProxyEvent, ProxyRequest } from "./proxy/types";

let proxyServer: ProxyServer | null = null;
let repository: UsageRepository | null = null;
let db: Database.Database | null = null;

const PROXY_PORT_MIN = 8765;
const PROXY_PORT_MAX = 8775;

/**
 * Try to start the proxy server, cycling through ports 8765–8775
 * on EADDRINUSE. Returns the started server or null on failure.
 */
async function startProxyServer(): Promise<ProxyServer | null> {
  for (let port = PROXY_PORT_MIN; port <= PROXY_PORT_MAX; port++) {
    const server = new ProxyServer({ port });
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

  // Register all provider implementations before starting the proxy
  registerAllProviders();

  // Start the proxy server with graceful degradation
  try {
    proxyServer = await startProxyServer();
    if (proxyServer) {
      registerProxyIpcHandlers(proxyServer, repository);

      // Wire proxy events to database
      proxyServer.on("request-completed", (event: ProxyEvent) => {
        // The request-completed event merges ProxyRequest + ProxyResponse fields
        const data = event.data as ProxyRequest & {
          requestId: string;
          statusCode: number;
          headers: Record<string, string>;
          body: unknown;
          usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            modelId: string;
            providerId: string;
          };
          timestamp: Date;
        };

        if (data.usage && db) {
          const usage = data.usage;
          // Use modelId from usage, fall back to model from request
          const modelId = usage.modelId || data.model || "unknown";

          // Calculate cost from model pricing
          const modelRow = db
            .prepare(
              "SELECT input_price_per_million, output_price_per_million FROM models WHERE id = ?",
            )
            .get(modelId) as
            | {
                input_price_per_million: number;
                output_price_per_million: number;
              }
            | undefined;

          const inputCost = modelRow
            ? (usage.promptTokens / 1_000_000) *
              modelRow.input_price_per_million
            : 0;
          const outputCost = modelRow
            ? (usage.completionTokens / 1_000_000) *
              modelRow.output_price_per_million
            : 0;
          const totalCost = inputCost + outputCost;

          const now = new Date();
          const dateStr = format(now, "yyyy-MM-dd");
          const weekStartStr = format(
            startOfWeek(now, { weekStartsOn: 1 }),
            "yyyy-MM-dd",
          );
          const isError = data.statusCode >= 400;

          // Insert usage log
          repository?.insertUsageLog({
            provider_id: usage.providerId,
            model_id: modelId,
            endpoint: data.endpoint,
            method: data.method,
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.totalTokens,
            input_cost: inputCost,
            output_cost: outputCost,
            total_cost: totalCost,
            is_error: isError,
            requested_at: data.timestamp?.toISOString() ?? now.toISOString(),
            completed_at: now.toISOString(),
          });

          // Upsert daily summary (per-model per-day)
          repository?.upsertDailySummary(dateStr, usage.providerId, modelId, {
            request_count: 1,
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.totalTokens,
            input_cost: inputCost,
            output_cost: outputCost,
            total_cost: totalCost,
            error_count: isError ? 1 : 0,
          });

          // Upsert weekly summary (per-model per-week)
          repository?.upsertWeeklySummary(
            weekStartStr,
            usage.providerId,
            modelId,
            {
              request_count: 1,
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens,
              input_cost: inputCost,
              output_cost: outputCost,
              total_cost: totalCost,
              error_count: isError ? 1 : 0,
            },
          );
        } else if (repository) {
          // No usage data — still log the request as an error entry
          const now = new Date();
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
            is_error: true,
            error_message: "No usage data extracted from response",
            requested_at: data.timestamp?.toISOString() ?? now.toISOString(),
            completed_at: now.toISOString(),
          });
        }
      });

      proxyServer.on("request-error", (event: ProxyEvent) => {
        console.error("[Main] Proxy request error:", event.data);
        // Errors are already handled by the request-completed handler above
        // (is_error flag). This handler is for network-level errors that
        // never got a response.
      });
    }
  } catch (err) {
    console.error("[Main] Proxy server initialization failed:", err);
  }

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
