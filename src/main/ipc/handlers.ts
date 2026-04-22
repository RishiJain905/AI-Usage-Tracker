import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { dirname, extname } from "path";
import { PROVIDER_ROUTES } from "../proxy/routing";
import type { ProxyServer } from "../proxy/server";
import type {
  ProviderAuthMode,
  ProviderConfig,
  ProxyStatus,
} from "../proxy/types";
import type { UsageRepository } from "../database/repository";
import type { Period, ProviderApiKeyMetadata } from "../database/types";
import { decryptKey, encryptKey } from "../security/encryption";

let proxyServer: ProxyServer | null = null;
let repository: UsageRepository | null = null;

const APP_SETTINGS_KEY = "app_settings";
const API_KEY_SETTING_PREFIX = "provider_api_key:";
const AUTH_MODE_SETTING_PREFIX = "provider_auth_mode:";

const DEFAULT_PROXY_PORT = 8765;
const MIN_PROXY_PORT = 1024;
const MAX_PROXY_PORT = 65535;

interface StoredProxySettings {
  port: number;
  enabled: boolean;
  autoStart: boolean;
}

interface StoredProviderEntry {
  id: string;
  name?: string;
  baseUrl?: string;
  isActive?: boolean;
}

interface StoredAppSettings {
  proxy?: Partial<StoredProxySettings>;
  providers?: StoredProviderEntry[];
}

export interface RuntimeProviderSnapshot {
  providerId: string;
  providerName: string;
  baseUrl: string;
  isActive: boolean;
  authMode: ProviderAuthMode;
  hasKey: boolean;
  keyUpdatedAt: string | null;
}

export interface ApiKeyListMetadata extends RuntimeProviderSnapshot {
  maskedPreview: string | null;
  isValid: boolean | null;
  lastValidatedAt: string | null;
}

export interface RuntimeSettingsSnapshot {
  proxy: StoredProxySettings;
  providers: RuntimeProviderSnapshot[];
}

export interface RuntimeSettingsResolved {
  snapshot: RuntimeSettingsSnapshot;
  providerRuntime: Partial<Record<string, Partial<ProviderConfig>>>;
}

export interface RuntimeSettingsBridge {
  getSnapshot: () => RuntimeSettingsSnapshot;
  refreshFromRepository: () => RuntimeSettingsSnapshot;
}

interface RuntimeSettingsUpdatePayload {
  proxy?: Partial<StoredProxySettings>;
  providers?: Array<{
    providerId: string;
    baseUrl?: string;
    isActive?: boolean;
    authMode?: ProviderAuthMode;
  }>;
}

interface ApiKeySetPayload {
  providerId: string;
  apiKey: string;
  authMode?: ProviderAuthMode;
}

interface ProviderTestPayload {
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
}

interface ApiKeyMutationResponse {
  ok: boolean;
  providerId: string;
  hasKey: boolean;
  authMode?: ProviderAuthMode;
  keyUpdatedAt?: string | null;
}

interface RuntimeSettingsUpdateResponse {
  ok: boolean;
  settings: RuntimeSettingsSnapshot;
}

interface ProviderConnectionResponse {
  ok: boolean;
  providerId: string;
  reachable: boolean;
  authMode?: ProviderAuthMode;
  error?: string;
}

function isSecretSettingKey(key: string): boolean {
  return key.startsWith(API_KEY_SETTING_PREFIX);
}

function normalizeProviderId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAuthMode(value: unknown): ProviderAuthMode {
  return value === "inject" ? "inject" : "passthrough";
}

function maskApiKeyPreview(apiKey: string | null): string | null {
  if (!apiKey) {
    return null;
  }

  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****`;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function decryptStoredApiKey(encryptedKey: string | null): string | null {
  if (!encryptedKey) {
    return null;
  }

  try {
    return decryptKey(encryptedKey);
  } catch (error) {
    console.warn("[IPC] Failed to decrypt stored API key:", error);
    return null;
  }
}

function encryptApiKeyValue(apiKey: string): string | null {
  try {
    return encryptKey(apiKey);
  } catch (error) {
    console.warn("[IPC] Failed to encrypt API key:", error);
    return null;
  }
}

function resolveOpenDataDirectoryTarget(payload: unknown): string {
  const defaultPath = app.getPath("userData");

  const candidate =
    typeof payload === "string"
      ? payload
      : payload && typeof payload === "object"
        ? ((payload as { path?: unknown; databasePath?: unknown }).path ??
          (payload as { path?: unknown; databasePath?: unknown }).databasePath)
        : null;

  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return defaultPath;
  }

  const trimmed = candidate.trim();
  return extname(trimmed) ? dirname(trimmed) : trimmed;
}

function normalizeProxyPort(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_PROXY_PORT;
  }
  if (value < MIN_PROXY_PORT || value > MAX_PROXY_PORT) {
    return DEFAULT_PROXY_PORT;
  }
  return value;
}

function parseStoredAppSettings(raw: string | null): StoredAppSettings {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as StoredAppSettings;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function toProviderRuntimeSnapshot(
  repo: Pick<
    UsageRepository,
    "getSetting" | "getEncryptedApiKey" | "listApiKeyMetadata"
  >,
  appSettings: StoredAppSettings,
): RuntimeSettingsResolved {
  const providerIds = new Set<string>(Object.keys(PROVIDER_ROUTES));
  const apiKeyMetadataByProvider = new Map<string, ProviderApiKeyMetadata>();

  for (const metadata of repo.listApiKeyMetadata()) {
    apiKeyMetadataByProvider.set(metadata.provider_id, metadata);
  }

  for (const entry of appSettings.providers ?? []) {
    const providerId = normalizeProviderId(entry?.id);
    if (providerId) {
      providerIds.add(providerId);
    }
  }

  const providers: RuntimeProviderSnapshot[] = [];
  const providerRuntime: Partial<Record<string, Partial<ProviderConfig>>> = {};

  for (const providerId of providerIds) {
    const route = PROVIDER_ROUTES[providerId];
    const stored = (appSettings.providers ?? []).find(
      (entry) => normalizeProviderId(entry.id) === providerId,
    );
    const providerName =
      (stored?.name && stored.name.trim()) || route?.name || providerId;
    const baseUrl =
      (stored?.baseUrl && stored.baseUrl.trim()) || route?.baseUrl || "";
    const isActive = stored?.isActive ?? true;
    const authMode = normalizeAuthMode(
      repo.getSetting(`${AUTH_MODE_SETTING_PREFIX}${providerId}`),
    );
    const apiKeyMetadata = apiKeyMetadataByProvider.get(providerId);
    const encryptedKey = repo.getEncryptedApiKey(providerId);
    const decryptedKey = decryptStoredApiKey(encryptedKey);

    providers.push({
      providerId,
      providerName,
      baseUrl,
      isActive,
      authMode,
      hasKey: apiKeyMetadata?.has_api_key ?? false,
      keyUpdatedAt: apiKeyMetadata?.created_at ?? null,
    });

    providerRuntime[providerId] = {
      id: providerId,
      name: providerName,
      baseUrl,
      authMode,
      apiKey: decryptedKey ?? undefined,
    };
  }

  const proxy = {
    port: normalizeProxyPort(appSettings.proxy?.port),
    enabled: appSettings.proxy?.enabled ?? true,
    autoStart: appSettings.proxy?.autoStart ?? true,
  };

  return {
    snapshot: { proxy, providers },
    providerRuntime,
  };
}

export function resolveRuntimeSettingsFromRepository(
  repo: Pick<
    UsageRepository,
    "getSetting" | "getEncryptedApiKey" | "listApiKeyMetadata"
  >,
): RuntimeSettingsResolved {
  const appSettings = parseStoredAppSettings(repo.getSetting(APP_SETTINGS_KEY));
  return toProviderRuntimeSnapshot(repo, appSettings);
}

function getRuntimeSnapshot(
  repo: UsageRepository,
  runtimeBridge?: RuntimeSettingsBridge,
): RuntimeSettingsSnapshot {
  if (runtimeBridge?.getSnapshot) {
    return runtimeBridge.getSnapshot();
  }
  return resolveRuntimeSettingsFromRepository(repo).snapshot;
}

function refreshRuntimeSnapshot(
  repo: UsageRepository,
  runtimeBridge?: RuntimeSettingsBridge,
): RuntimeSettingsSnapshot {
  if (runtimeBridge?.refreshFromRepository) {
    return runtimeBridge.refreshFromRepository();
  }
  return resolveRuntimeSettingsFromRepository(repo).snapshot;
}

function buildApiKeyListMetadata(
  repo: UsageRepository,
  runtimeBridge?: RuntimeSettingsBridge,
): ApiKeyListMetadata[] {
  const runtimeProviders = getRuntimeSnapshot(repo, runtimeBridge).providers;
  const metadataByProvider = new Map(
    repo
      .listApiKeyMetadata()
      .map((metadata) => [metadata.provider_id, metadata]),
  );

  return runtimeProviders.map((provider) => {
    const metadata = metadataByProvider.get(provider.providerId);
    return {
      ...provider,
      maskedPreview: maskApiKeyPreview(
        decryptStoredApiKey(repo.getEncryptedApiKey(provider.providerId)),
      ),
      isValid: metadata?.is_valid ?? null,
      lastValidatedAt: metadata?.last_validated_at ?? null,
    };
  });
}

function applyRuntimeSettingsUpdate(
  repo: UsageRepository,
  payload: RuntimeSettingsUpdatePayload,
): void {
  const appSettings = parseStoredAppSettings(repo.getSetting(APP_SETTINGS_KEY));
  const nextAppSettings: StoredAppSettings = {
    ...appSettings,
    proxy: { ...(appSettings.proxy ?? {}) },
    providers: [...(appSettings.providers ?? [])],
  };

  if (payload.proxy) {
    if (typeof payload.proxy.port === "number") {
      nextAppSettings.proxy = {
        ...nextAppSettings.proxy,
        port: normalizeProxyPort(payload.proxy.port),
      };
    }
    if (typeof payload.proxy.enabled === "boolean") {
      nextAppSettings.proxy = {
        ...nextAppSettings.proxy,
        enabled: payload.proxy.enabled,
      };
    }
    if (typeof payload.proxy.autoStart === "boolean") {
      nextAppSettings.proxy = {
        ...nextAppSettings.proxy,
        autoStart: payload.proxy.autoStart,
      };
    }
  }

  if (Array.isArray(payload.providers)) {
    const providerIndex = new Map<string, number>();
    nextAppSettings.providers?.forEach((entry, index) => {
      const providerId = normalizeProviderId(entry.id);
      if (providerId) {
        providerIndex.set(providerId, index);
      }
    });

    for (const update of payload.providers) {
      const providerId = normalizeProviderId(update.providerId);
      if (!providerId) continue;

      const existingIndex = providerIndex.get(providerId);
      const existing =
        existingIndex !== undefined
          ? (nextAppSettings.providers?.[existingIndex] ?? { id: providerId })
          : { id: providerId };
      const merged: StoredProviderEntry = {
        ...existing,
        id: providerId,
      };

      if (typeof update.baseUrl === "string") {
        merged.baseUrl = update.baseUrl.trim();
      }
      if (typeof update.isActive === "boolean") {
        merged.isActive = update.isActive;
      }
      if (update.authMode) {
        repo.setSetting(
          `${AUTH_MODE_SETTING_PREFIX}${providerId}`,
          normalizeAuthMode(update.authMode),
        );
      }

      if (existingIndex === undefined) {
        nextAppSettings.providers?.push(merged);
        providerIndex.set(
          providerId,
          (nextAppSettings.providers?.length ?? 1) - 1,
        );
      } else if (nextAppSettings.providers) {
        nextAppSettings.providers[existingIndex] = merged;
      }
    }
  }

  repo.setSetting(APP_SETTINGS_KEY, JSON.stringify(nextAppSettings));
}

function validateProviderConnectionPayload(
  payload: unknown,
): ProviderTestPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as ProviderTestPayload;
  const providerId = normalizeProviderId(candidate.providerId);
  if (!providerId) return null;
  return {
    providerId,
    baseUrl:
      typeof candidate.baseUrl === "string" ? candidate.baseUrl : undefined,
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey : undefined,
  };
}

/**
 * Register IPC handlers for proxy server communication and database queries.
 * Called from index.ts after the proxy server instance is created.
 */
export function registerProxyIpcHandlers(
  server: ProxyServer,
  repo: UsageRepository,
  runtimeBridge?: RuntimeSettingsBridge,
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

  ipcMain.handle(
    "db:get-model-usage-trend",
    (_event, modelId: string, days: number) => {
      return repository?.getModelUsageTrend(modelId, days);
    },
  );

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
    (_event, filters: Parameters<UsageRepository["getUsageLogs"]>[0]) => {
      return repository?.getUsageLogs(filters);
    },
  );

  ipcMain.handle(
    "db:get-total-tokens-by-provider",
    (_event, period: Period) => {
      return repository?.getTotalTokensByProvider(period);
    },
  );

  ipcMain.handle("db:get-total-cost-by-provider", (_event, period: Period) => {
    return repository?.getTotalCostByProvider(period);
  });

  ipcMain.handle("db:get-total-tokens-by-model", (_event, period: Period) => {
    return repository?.getTotalTokensByModel(period);
  });

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

  ipcMain.handle("db:get-recent-logs", (_event, limit?: number) => {
    return repository?.getUsageLogs({
      limit: limit ?? 50,
      offset: 0,
    });
  });

  ipcMain.handle("db:get-models", () => {
    return repository?.getAllModels();
  });

  ipcMain.handle("db:get-setting", (_event, key: string) => {
    if (isSecretSettingKey(key)) {
      return null;
    }
    return repository?.getSetting(key);
  });

  ipcMain.handle("db:set-setting", (_event, key: string, value: string) => {
    if (isSecretSettingKey(key)) {
      return false;
    }
    if (!repository) {
      return false;
    }
    try {
      repository.setSetting(key, value);
      if (key === APP_SETTINGS_KEY) {
        refreshRuntimeSnapshot(repository, runtimeBridge);
      }
      return true;
    } catch (error) {
      console.warn("[IPC] db:set-setting failed:", error);
      return false;
    }
  });

  // ---------------------------------------------------------------------------
  // Structured settings / API key handlers
  // ---------------------------------------------------------------------------

  const listApiKeyMetadata = (): ApiKeyListMetadata[] => {
    if (!repository) return [];
    return buildApiKeyListMetadata(repository, runtimeBridge);
  };

  ipcMain.handle("api-key:list", () => listApiKeyMetadata());
  ipcMain.handle("get-api-keys", () => listApiKeyMetadata());

  const setApiKey = (
    _event: unknown,
    payload: unknown,
  ): ApiKeyMutationResponse => {
    if (!repository) {
      return { ok: false, providerId: "", hasKey: false };
    }

    if (!payload || typeof payload !== "object") {
      return { ok: false, providerId: "", hasKey: false };
    }

    const candidate = payload as ApiKeySetPayload;
    const providerId = normalizeProviderId(candidate.providerId);
    const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey : "";

    if (!providerId || apiKey.trim().length === 0) {
      return { ok: false, providerId: providerId ?? "", hasKey: false };
    }

    const encryptedKey = encryptApiKeyValue(apiKey.trim());
    if (!encryptedKey) {
      return { ok: false, providerId, hasKey: false };
    }

    repository.deleteApiKey(providerId);
    repository.setApiKey(providerId, encryptedKey);

    if (candidate.authMode) {
      repository.setSetting(
        `${AUTH_MODE_SETTING_PREFIX}${providerId}`,
        normalizeAuthMode(candidate.authMode),
      );
    }

    const snapshot = refreshRuntimeSnapshot(repository, runtimeBridge);
    const provider = snapshot.providers.find(
      (entry) => entry.providerId === providerId,
    );

    return {
      ok: true,
      providerId,
      hasKey: provider?.hasKey ?? true,
      authMode: provider?.authMode ?? normalizeAuthMode(candidate.authMode),
      keyUpdatedAt: provider?.keyUpdatedAt ?? null,
    };
  };

  ipcMain.handle("api-key:set", setApiKey);
  ipcMain.handle("set-api-key", setApiKey);

  const deleteApiKey = (
    _event: unknown,
    payload: unknown,
  ): ApiKeyMutationResponse => {
    if (!repository) {
      return { ok: false, providerId: "", hasKey: false };
    }

    const providerId = normalizeProviderId(
      typeof payload === "string"
        ? payload
        : (payload as { providerId?: unknown } | undefined)?.providerId,
    );
    if (!providerId) {
      return { ok: false, providerId: "", hasKey: false };
    }

    repository.deleteApiKey(providerId);
    const snapshot = refreshRuntimeSnapshot(repository, runtimeBridge);
    const provider = snapshot.providers.find(
      (entry) => entry.providerId === providerId,
    );

    return {
      ok: true,
      providerId,
      hasKey: provider?.hasKey ?? false,
      authMode: provider?.authMode ?? "passthrough",
      keyUpdatedAt: provider?.keyUpdatedAt ?? null,
    };
  };

  ipcMain.handle("api-key:delete", deleteApiKey);
  ipcMain.handle("delete-api-key", deleteApiKey);

  const clearDataBeforeHandler = (
    _event: unknown,
    payload: unknown,
  ): {
    ok: boolean;
    before: string;
    settingsRetained: boolean;
    usageLogsDeleted?: number;
    error?: string;
  } => {
    if (!repository) {
      return {
        ok: false,
        before: "",
        settingsRetained: true,
        error: "Settings repository is unavailable.",
      };
    }

    const before =
      typeof payload === "string"
        ? payload.trim()
        : payload && typeof payload === "object"
          ? (() => {
              const candidate = (
                payload as {
                  before?: unknown;
                  date?: unknown;
                }
              ).before;
              if (typeof candidate === "string") {
                return candidate.trim();
              }
              const fallback = (
                payload as {
                  before?: unknown;
                  date?: unknown;
                }
              ).date;
              return typeof fallback === "string" ? fallback.trim() : "";
            })()
          : "";

    if (!before) {
      return {
        ok: false,
        before: "",
        settingsRetained: true,
        error: "Invalid cutoff date.",
      };
    }

    return {
      ok: true,
      before,
      settingsRetained: true,
      usageLogsDeleted: repository.deleteUsageBefore(before),
    };
  };

  ipcMain.handle("data:clear-before", clearDataBeforeHandler);

  const clearAllDataHandler = (): {
    ok: boolean;
    settingsRetained: boolean;
    usage_logs?: number;
    daily_summary?: number;
    weekly_summary?: number;
    api_keys?: number;
    error?: string;
  } => {
    if (!repository) {
      return {
        ok: false,
        settingsRetained: true,
        error: "Settings repository is unavailable.",
      };
    }

    const usage = repository.clearUsageData();
    const apiKeys = repository.clearApiKeys();

    return {
      ok: true,
      settingsRetained: true,
      usage_logs: usage.usage_logs,
      daily_summary: usage.daily_summary,
      weekly_summary: usage.weekly_summary,
      api_keys: apiKeys,
    };
  };

  ipcMain.handle("data:clear-all", clearAllDataHandler);

  ipcMain.handle("app:check-updates", async () => {
    const { checkForUpdates: checkForUpdatesViaUpdater } =
      await import("../updater");
    return checkForUpdatesViaUpdater();
  });

  ipcMain.handle("app:download-update", async () => {
    const { downloadUpdate: downloadUpdateViaUpdater } =
      await import("../updater");
    return downloadUpdateViaUpdater();
  });

  ipcMain.handle("app:install-update", async () => {
    const { installUpdate: installUpdateViaUpdater } =
      await import("../updater");
    installUpdateViaUpdater();
    return { ok: true };
  });

  ipcMain.handle("app:open-data-directory", (_event, payload: unknown) => {
    const targetPath = resolveOpenDataDirectoryTarget(payload);
    const result = shell.openPath(targetPath);

    return Promise.resolve(result).then((error) => ({
      ok: error.length === 0,
      path: targetPath,
      error: error.length === 0 ? undefined : error,
    }));
  });

  const getRuntimeSettingsHandler = (): RuntimeSettingsSnapshot => {
    if (!repository) {
      return {
        proxy: {
          port: DEFAULT_PROXY_PORT,
          enabled: true,
          autoStart: true,
        },
        providers: [],
      } satisfies RuntimeSettingsSnapshot;
    }

    return getRuntimeSnapshot(repository, runtimeBridge);
  };

  ipcMain.handle("settings:get-runtime", getRuntimeSettingsHandler);
  ipcMain.handle("settings:get", getRuntimeSettingsHandler);

  const updateRuntimeSettingsHandler = (
    _event: unknown,
    payload: unknown,
  ): RuntimeSettingsUpdateResponse => {
    if (!repository || !payload || typeof payload !== "object") {
      return { ok: false, settings: getRuntimeSettingsHandler() };
    }

    applyRuntimeSettingsUpdate(
      repository,
      payload as RuntimeSettingsUpdatePayload,
    );
    const settings = refreshRuntimeSnapshot(repository, runtimeBridge);
    return { ok: true, settings };
  };

  ipcMain.handle("settings:update-runtime", updateRuntimeSettingsHandler);
  ipcMain.handle("update-settings", updateRuntimeSettingsHandler);

  const testProviderConnection = (
    _event: unknown,
    payload: unknown,
  ): ProviderConnectionResponse => {
    if (!repository) {
      return {
        ok: false,
        providerId: "",
        reachable: false,
        error: "Settings repository is unavailable.",
      };
    }

    const request = validateProviderConnectionPayload(payload);
    if (!request) {
      return {
        ok: false,
        providerId: "",
        reachable: false,
        error: "Invalid provider test payload.",
      };
    }

    const snapshot = getRuntimeSnapshot(repository, runtimeBridge);
    const provider = snapshot.providers.find(
      (entry) => entry.providerId === request.providerId,
    );

    if (!provider) {
      return {
        ok: false,
        providerId: request.providerId,
        reachable: false,
        error: "Unknown provider.",
      };
    }

    const resolvedBaseUrl = request.baseUrl?.trim() || provider.baseUrl;
    if (!resolvedBaseUrl) {
      return {
        ok: false,
        providerId: request.providerId,
        reachable: false,
        error: "Provider base URL is missing.",
      };
    }

    try {
      new URL(resolvedBaseUrl);
    } catch {
      return {
        ok: false,
        providerId: request.providerId,
        reachable: false,
        error: "Invalid provider base URL.",
      };
    }

    if (
      provider.authMode === "inject" &&
      !provider.hasKey &&
      !(request.apiKey && request.apiKey.trim())
    ) {
      return {
        ok: false,
        providerId: request.providerId,
        reachable: false,
        error: "No stored API key for inject mode.",
      };
    }

    // Stream B only requires status/metadata over IPC. We intentionally do not
    // return any key material and keep this check side-effect free here.
    return {
      ok: true,
      providerId: request.providerId,
      reachable: true,
      authMode: provider.authMode,
    };
  };

  ipcMain.handle("provider:test-connection", testProviderConnection);
  ipcMain.handle("test-api-key", testProviderConnection);

  // ---------------------------------------------------------------------------
  // Proxy control handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle("proxy:toggle", async (): Promise<boolean> => {
    if (!proxyServer) return false;

    try {
      if (proxyServer.isRunning) {
        await proxyServer.stop();
      } else {
        await proxyServer.start();
      }
      // Broadcast new status to all windows
      broadcastToRenderer("proxy-status", {
        isRunning: proxyServer.isRunning,
        port: proxyServer.port,
      });
      return proxyServer.isRunning;
    } catch (err) {
      console.error("[IPC] proxy:toggle failed:", err);
      return false;
    }
  });

  // ---------------------------------------------------------------------------
  // Data export handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "export:csv",
    (_event, options: import("../export/csv").CsvExportOptions) => {
      if (!repository) return "";
      const { exportToCsv } =
        require("../export/csv") as typeof import("../export/csv");
      return exportToCsv(repository, options);
    },
  );

  ipcMain.handle(
    "export:json",
    (_event, options: import("../export/json").JsonExportOptions) => {
      if (!repository) return "{}";
      const { exportToJson } =
        require("../export/json") as typeof import("../export/json");
      return exportToJson(repository, options);
    },
  );

  ipcMain.handle(
    "export:html-report",
    (_event, options: import("../export/report").ReportOptions) => {
      if (!repository) return "";
      const { generateHtmlReport } =
        require("../export/report") as typeof import("../export/report");
      return generateHtmlReport(repository, options);
    },
  );

  ipcMain.handle(
    "export:save-file",
    async (
      _event,
      payload: {
        content: string;
        defaultName: string;
        format: "csv" | "json" | "html" | "png" | "svg" | "db";
      },
    ) => {
      const result = await dialog.showSaveDialog({
        title: "Export Usage Data",
        defaultPath: payload.defaultName,
        filters: [
          { name: payload.format.toUpperCase(), extensions: [payload.format] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }

      const fs = await import("fs");
      fs.writeFileSync(result.filePath, payload.content, "utf-8");
      return { canceled: false, filePath: result.filePath };
    },
  );

  ipcMain.handle(
    "export:chart-image",
    async (
      _event,
      payload: { data: string; defaultName: string; format: "png" | "svg" },
    ) => {
      const result = await dialog.showSaveDialog({
        title: "Save Chart Image",
        defaultPath: payload.defaultName,
        filters: [
          { name: payload.format.toUpperCase(), extensions: [payload.format] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }

      const fs = await import("fs");
      if (payload.format === "svg") {
        fs.writeFileSync(result.filePath, payload.data, "utf-8");
      } else {
        const buffer = Buffer.from(payload.data, "base64");
        fs.writeFileSync(result.filePath, buffer);
      }
      return { canceled: false, filePath: result.filePath };
    },
  );

  // ---------------------------------------------------------------------------
  // Data management handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle("data:backup", async () => {
    if (!repository) {
      return { ok: false, error: "Repository not available." };
    }

    try {
      const { getBackupFilePath, rotateBackups, backupDatabase } =
        require("../export/backup") as typeof import("../export/backup");
      const appDataPath = app.getPath("userData");
      const backupPath = getBackupFilePath(appDataPath);

      const { getDatabase } =
        require("../database") as typeof import("../database");
      const db = getDatabase();
      await backupDatabase(db, backupPath);

      const backupDir = dirname(backupPath);
      rotateBackups(backupDir, 5);

      return { ok: true, backupPath };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown backup error",
      };
    }
  });

  ipcMain.handle(
    "data:restore",
    async (_event, payload: { backupPath: string }) => {
      const { validateBackup } =
        require("../export/restore") as typeof import("../export/restore");

      if (!validateBackup(payload.backupPath)) {
        return { ok: false, error: "Invalid backup file." };
      }

      try {
        const appDataPath = app.getPath("userData");
        const pathModule = await import("path");
        const dbPath = pathModule.join(appDataPath, "ai-tracker.db");

        const { backupDatabase } =
          require("../export/backup") as typeof import("../export/backup");
        const fs = await import("fs");
        const preRestoreBackupPath = pathModule.join(
          appDataPath,
          "backups",
          `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
        );

        const preRestoreDir = pathModule.dirname(preRestoreBackupPath);
        if (!fs.existsSync(preRestoreDir)) {
          fs.mkdirSync(preRestoreDir, { recursive: true });
        }

        const { getDatabase } =
          require("../database") as typeof import("../database");
        const db = getDatabase();
        await backupDatabase(db, preRestoreBackupPath);

        fs.copyFileSync(payload.backupPath, dbPath);

        return { ok: true, preRestoreBackupPath, restartNeeded: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Unknown restore error",
        };
      }
    },
  );

  ipcMain.handle(
    "data:cleanup",
    (_event, payload: { retentionDays?: number }) => {
      if (!repository) {
        return {
          ok: false,
          error: "Repository not available.",
          deletedCount: 0,
        };
      }

      try {
        const { runCleanup, getRetentionDays } =
          require("../database/cleanup") as typeof import("../database/cleanup");
        const retentionDays =
          payload.retentionDays ?? getRetentionDays(repository);
        const deletedCount = runCleanup(repository, retentionDays);
        return { ok: true, deletedCount, retentionDays };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Unknown cleanup error",
          deletedCount: 0,
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // ZhipuAI sync handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "sync:zhipuai",
    async (_event, payload: { apiKey: string; since?: string }) => {
      if (!repository) {
        return { ok: false, error: "Repository not available.", result: null };
      }

      try {
        const { ZhipuAiSync } =
          require("../sync/zhipuai-sync") as typeof import("../sync/zhipuai-sync");
        const syncer = new ZhipuAiSync();
        const since =
          payload.since ??
          repository.getSetting("last_sync_zhipuai") ??
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const result = await syncer.sync(repository, payload.apiKey, since);
        return { ok: true, result };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Unknown sync error",
          result: null,
        };
      }
    },
  );

  ipcMain.handle("sync:zhipuai-status", () => {
    if (!repository) {
      return { lastSyncTimestamp: null };
    }
    const lastSync = repository.getSetting("last_sync_zhipuai");
    return { lastSyncTimestamp: lastSync };
  });
}

// ---------------------------------------------------------------------------
// Broadcast helpers — send events from main to all renderer windows
// ---------------------------------------------------------------------------

/**
 * Send an IPC event to every open BrowserWindow.
 * Used for real-time updates (usage, proxy status, provider errors).
 */
export function broadcastToRenderer(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Convenience helper: broadcast a usage-updated event to all renderer windows.
 * Call this after inserting or updating usage data so the UI can refresh.
 */
export function broadcastUsageUpdate(data: unknown): void {
  broadcastToRenderer("usage-updated", data);
}
