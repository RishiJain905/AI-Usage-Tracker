import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProxyServer } from "../proxy/server";
import type { UsageRepository } from "../database/repository";

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => {
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  };

  const BrowserWindow = {
    getAllWindows: vi.fn(() => []),
  };

  const shell = {
    openPath: vi.fn(async (_target: string) => ""),
  };

  const app = {
    getName: vi.fn(() => "AI Usage Tracker"),
    getVersion: vi.fn(() => "1.0.0"),
    getPath: vi.fn((name: string) =>
      name === "userData"
        ? "C:/Users/test/AppData/Roaming/AI Usage Tracker"
        : "C:/tmp",
    ),
  };

  return {
    ipcMain,
    BrowserWindow,
    shell,
    app,
  };
});

vi.mock("../security/encryption", () => ({
  encryptKey: vi.fn((key: string) => `enc:${key}`),
  decryptKey: vi.fn((key: string) => key.replace(/^enc:/, "")),
}));

import { decryptKey, encryptKey } from "../security/encryption";
import {
  registerProxyIpcHandlers,
  resolveRuntimeSettingsFromRepository,
} from "./handlers";

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcHandlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }
  return Promise.resolve(handler({} as never, ...args));
}

function createProxyStub(): ProxyServer {
  let running = false;
  return {
    get isRunning() {
      return running;
    },
    get port() {
      return 8765;
    },
    start: vi.fn(async () => {
      running = true;
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
  } as unknown as ProxyServer;
}

type ApiKeyRow = {
  provider_id: string;
  provider_name: string;
  encrypted_key: string;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
};

function createRepositoryStub(): UsageRepository {
  const settings = new Map<string, string>([
    ["provider_api_key:openai", "sk-plaintext-should-not-be-used"],
    ["provider_api_key_updated_at:openai", "2026-04-19T00:00:00.000Z"],
    ["provider_auth_mode:openai", "inject"],
    [
      "app_settings",
      JSON.stringify({
        proxy: { port: 8765, autoStart: true, enabled: true },
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            baseUrl: "https://api.openai.com/",
            isActive: true,
          },
        ],
      }),
    ],
  ]);

  const apiKeys = new Map<string, ApiKeyRow>([
    [
      "openai",
      {
        provider_id: "openai",
        provider_name: "OpenAI",
        encrypted_key: "enc:sk-openai-live-secret",
        is_valid: false,
        last_validated_at: "2026-04-19T12:34:56.000Z",
        created_at: "2026-04-18T00:00:00.000Z",
      },
    ],
  ]);

  const toMetadata = (
    row: ApiKeyRow,
  ): {
    provider_id: string;
    provider_name: string;
    has_api_key: boolean;
    is_valid: boolean | null;
    last_validated_at: string | null;
    created_at: string | null;
  } => ({
    provider_id: row.provider_id,
    provider_name: row.provider_name,
    has_api_key: true,
    is_valid: row.is_valid,
    last_validated_at: row.last_validated_at,
    created_at: row.created_at,
  });

  const repo = {
    getSetting: vi.fn((key: string) => settings.get(key) ?? null),
    setSetting: vi.fn((key: string, value: string) => {
      settings.set(key, value);
    }),
    getEncryptedApiKey: vi.fn((providerId: string) => {
      return apiKeys.get(providerId)?.encrypted_key ?? null;
    }),
    listApiKeyMetadata: vi.fn(() => {
      return Array.from(apiKeys.values()).map((row) => toMetadata(row));
    }),
    getProviderApiKeyMetadata: vi.fn((providerId: string) => {
      const row = apiKeys.get(providerId);
      return row ? toMetadata(row) : null;
    }),
    setApiKey: vi.fn((providerId: string, encryptedKey: string) => {
      const createdAt = "2026-04-20T00:00:00.000Z";
      apiKeys.set(providerId, {
        provider_id: providerId,
        provider_name: providerId === "openai" ? "OpenAI" : providerId,
        encrypted_key: encryptedKey,
        is_valid: true,
        last_validated_at: null,
        created_at: createdAt,
      });

      return {
        id: `api-key-${providerId}`,
        provider_id: providerId,
        is_valid: true,
        last_validated_at: null,
        created_at: createdAt,
      };
    }),
    setApiKeyValidation: vi.fn(
      (
        providerId: string,
        isValid: boolean,
        lastValidatedAt = "2026-04-20T00:00:00.000Z",
      ) => {
        const existing = apiKeys.get(providerId);
        if (!existing) return null;

        const next = {
          ...existing,
          is_valid: isValid,
          last_validated_at: lastValidatedAt,
        };
        apiKeys.set(providerId, next);
        return {
          id: `api-key-${providerId}`,
          provider_id: providerId,
          is_valid: next.is_valid,
          last_validated_at: next.last_validated_at,
          created_at: next.created_at,
        };
      },
    ),
    deleteApiKey: vi.fn((providerId: string) => {
      return apiKeys.delete(providerId) ? 1 : 0;
    }),
    clearUsageData: vi.fn(() => ({
      usage_logs: 4,
      daily_summary: 2,
      weekly_summary: 1,
    })),
    clearApiKeys: vi.fn(() => {
      const count = apiKeys.size;
      apiKeys.clear();
      return count;
    }),
    deleteUsageBefore: vi.fn((_date: string) => 42),
    vacuum: vi.fn(),
  } as unknown as UsageRepository;

  return repo;
}

describe("registerProxyIpcHandlers", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it("uses encrypted api-key storage and keeps decrypted key material in main only", () => {
    const repository = createRepositoryStub();

    const resolved = resolveRuntimeSettingsFromRepository(repository);

    expect(repository.getSetting).toHaveBeenCalledWith("app_settings");
    expect(repository.getSetting).not.toHaveBeenCalledWith(
      "provider_api_key:openai",
    );
    expect(repository.getEncryptedApiKey).toHaveBeenCalledWith("openai");
    expect(decryptKey).toHaveBeenCalledWith("enc:sk-openai-live-secret");

    const openai = resolved.snapshot.providers.find(
      (entry) => entry.providerId === "openai",
    );

    expect(openai).toMatchObject({
      providerId: "openai",
      hasKey: true,
      authMode: "inject",
    });
    expect(openai).not.toHaveProperty("apiKey");
    expect(resolved.providerRuntime.openai?.apiKey).toBe(
      "sk-openai-live-secret",
    );
  });

  it("returns API key metadata with masked previews and validation state", async () => {
    registerProxyIpcHandlers(createProxyStub(), createRepositoryStub());

    const keys = (await invoke("api-key:list")) as Array<
      Record<string, unknown>
    >;
    const openai = keys.find((entry) => entry.providerId === "openai");

    expect(openai).toBeDefined();
    expect(openai).toMatchObject({
      providerId: "openai",
      providerName: "OpenAI",
      hasKey: true,
      authMode: "inject",
      maskedPreview: "sk-o...cret",
      isValid: false,
      lastValidatedAt: "2026-04-19T12:34:56.000Z",
    });
    expect(openai).not.toHaveProperty("apiKey");
    expect(JSON.stringify(keys)).not.toContain("sk-openai-live-secret");
  });

  it("stores api keys through the encrypted api_keys repository path", async () => {
    const repository = createRepositoryStub();
    registerProxyIpcHandlers(createProxyStub(), repository);

    const result = (await invoke("api-key:set", {
      providerId: "openai",
      apiKey: "sk-new-secret",
      authMode: "inject",
    })) as Record<string, unknown>;

    expect(encryptKey).toHaveBeenCalledWith("sk-new-secret");
    expect(repository.deleteApiKey).toHaveBeenCalledWith("openai");
    expect(repository.setApiKey).toHaveBeenCalledWith(
      "openai",
      "enc:sk-new-secret",
    );
    expect(repository.setSetting).not.toHaveBeenCalledWith(
      "provider_api_key:openai",
      expect.anything(),
    );
    expect(result).toMatchObject({
      ok: true,
      providerId: "openai",
      hasKey: true,
      authMode: "inject",
    });
    expect(result).not.toHaveProperty("apiKey");
    expect(JSON.stringify(result)).not.toContain("sk-new-secret");
  });

  it("keeps settings intact when clearing data before a cutoff", async () => {
    const repository = createRepositoryStub();
    registerProxyIpcHandlers(createProxyStub(), repository);

    const result = (await invoke("data:clear-before", "2026-02-01")) as Record<
      string,
      unknown
    >;

    expect(repository.deleteUsageBefore).toHaveBeenCalledWith("2026-02-01");
    expect(repository.clearUsageData).not.toHaveBeenCalled();
    expect(repository.clearApiKeys).not.toHaveBeenCalled();
    expect(repository.getSetting("app_settings")).toContain("proxy");
    expect(result).toMatchObject({
      ok: true,
      before: "2026-02-01",
      settingsRetained: true,
      usageLogsDeleted: 42,
    });
  });

  it("clears usage data and api keys without deleting settings on clear-all", async () => {
    const repository = createRepositoryStub();
    registerProxyIpcHandlers(createProxyStub(), repository);

    const result = (await invoke("data:clear-all")) as Record<string, unknown>;

    expect(repository.clearUsageData).toHaveBeenCalledTimes(1);
    expect(repository.clearApiKeys).toHaveBeenCalledTimes(1);
    expect(repository.getSetting("app_settings")).toBeTruthy();
    expect(result).toMatchObject({
      ok: true,
      settingsRetained: true,
      usage_logs: 4,
      daily_summary: 2,
      weekly_summary: 1,
      api_keys: 1,
    });
  });

  it("exposes placeholder app maintenance channels", async () => {
    const repository = createRepositoryStub();
    registerProxyIpcHandlers(createProxyStub(), repository);

    const updateResult = (await invoke("app:check-updates")) as Record<
      string,
      unknown
    >;
    expect(updateResult).toMatchObject({
      ok: true,
      available: false,
      currentVersion: "1.0.0",
      latestVersion: null,
    });

    const openResult = (await invoke(
      "app:open-data-directory",
      "C:/Users/test/AppData/Roaming/AI Usage Tracker/ai-usage-tracker.db",
    )) as Record<string, unknown>;

    expect(openResult).toMatchObject({
      ok: true,
      path: "C:/Users/test/AppData/Roaming/AI Usage Tracker",
    });
  });

  it("blocks secret writes on generic db settings channel", async () => {
    registerProxyIpcHandlers(createProxyStub(), createRepositoryStub());

    const blocked = await invoke(
      "db:set-setting",
      "provider_api_key:openai",
      "sk-overwrite-denied",
    );
    expect(blocked).toBe(false);

    const keyList = (await invoke("api-key:list")) as Array<
      Record<string, unknown>
    >;
    expect(JSON.stringify(keyList)).not.toContain("sk-overwrite-denied");
  });
});
