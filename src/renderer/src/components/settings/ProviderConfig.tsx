import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  KeyRound,
  PencilLine,
  Plus,
  Save,
  TestTubeDiagonal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import AddProviderDialog, {
  type CustomProviderPayload,
} from "@/components/settings/AddProviderDialog";
import PricingEditor from "@/components/settings/PricingEditor";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ProviderConfigEntry } from "@/types/settings";

interface CustomProviderConfig extends CustomProviderPayload {}

interface RuntimeProviderMetadata {
  providerId: string;
  providerName: string;
  baseUrl: string;
  isActive: boolean;
  authMode: "passthrough" | "inject";
  hasKey: boolean;
  keyUpdatedAt: string | null;
}

interface ProviderRow {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
  keyUpdatedAt: string | null;
  isCustom: boolean;
  authMode: "passthrough" | "inject";
  ollamaMode: "local" | "cloud" | null;
}

const SETTINGS_KEY = "app_settings";
const CUSTOM_PROVIDERS_KEY = "custom_providers_v1";
const OLLAMA_LOCAL_URL = "http://localhost:11434";
const OLLAMA_CLOUD_URL = "https://ollama.com/v1";

function parseJsonRecord<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildProviderRows(
  runtimeProviders: RuntimeProviderMetadata[],
  customProviders: CustomProviderConfig[],
): ProviderRow[] {
  const customIdSet = new Set(customProviders.map((entry) => entry.id));

  return runtimeProviders
    .map((provider) => {
      const ollamaMode: ProviderRow["ollamaMode"] =
        provider.providerId === "ollama"
          ? provider.baseUrl === OLLAMA_CLOUD_URL
            ? "cloud"
            : "local"
          : null;

      return {
        id: provider.providerId,
        name: provider.providerName,
        baseUrl: provider.baseUrl,
        isActive: provider.isActive,
        hasApiKey: provider.hasKey,
        keyUpdatedAt: provider.keyUpdatedAt,
        isCustom: customIdSet.has(provider.providerId),
        authMode: provider.authMode,
        ollamaMode,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function ProviderConfig(): React.JSX.Element {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const [customProviders, setCustomProviders] = useState<
    CustomProviderConfig[]
  >([]);
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(
    null,
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pricingProviderId, setPricingProviderId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const providerIdSet = useMemo(
    () => new Set(rows.map((row) => row.id)),
    [rows],
  );

  const loadProviderConfig = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [runtimeSettings, rawCustomProviders] = await Promise.all([
        window.api.getRuntimeSettings(),
        window.api.dbGetSetting(CUSTOM_PROVIDERS_KEY),
      ]);

      const parsedCustom = parseJsonRecord<CustomProviderConfig[]>(
        rawCustomProviders,
        [],
      );

      setCustomProviders(parsedCustom);
      setRows(buildProviderRows(runtimeSettings.providers, parsedCustom));
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviderConfig();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProviderConfig]);

  const updateRow = (providerId: string, patch: Partial<ProviderRow>): void => {
    setRows((current) =>
      current.map((row) =>
        row.id === providerId ? { ...row, ...patch } : row,
      ),
    );
  };

  const persistProvider = async (row: ProviderRow): Promise<void> => {
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (!row.baseUrl.trim()) {
        throw new Error(`Base URL is required for ${row.name}.`);
      }
      if (!isValidHttpUrl(row.baseUrl)) {
        throw new Error(
          `Base URL for ${row.name} must be a valid http(s) URL.`,
        );
      }

      const result = await window.api.updateRuntimeSettings({
        providers: [
          {
            providerId: row.id,
            baseUrl: row.baseUrl,
            isActive: row.isActive,
            authMode: row.authMode,
          },
        ],
      });

      if (!result.ok) {
        throw new Error("Unable to save provider runtime settings.");
      }

      await loadSettings();
      await loadProviderConfig();
      setNotice(`Saved ${row.name} configuration.`);
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const saveProvider = async (providerId: string): Promise<void> => {
    const row = rows.find((entry) => entry.id === providerId);
    if (!row) return;
    await persistProvider(row);
  };

  const handleAddCustomProvider = async (
    provider: CustomProviderPayload,
  ): Promise<void> => {
    const nextCustomProviders = [...customProviders, provider];
    const nextProviderEntries: ProviderConfigEntry[] = [
      ...settings.providers.filter((entry) => entry.id !== provider.id),
      {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        isActive: true,
        hasApiKey: rows.some((row) => row.id === provider.id && row.hasApiKey),
      },
    ];
    const nextSettings = { ...settings, providers: nextProviderEntries };

    await Promise.all([
      window.api.dbSetSetting(
        CUSTOM_PROVIDERS_KEY,
        JSON.stringify(nextCustomProviders),
      ),
      window.api.dbSetSetting(SETTINGS_KEY, JSON.stringify(nextSettings)),
    ]);

    await loadSettings();
    await loadProviderConfig();
    setNotice(`Custom provider "${provider.name}" added.`);
  };

  const testConnection = async (providerId: string): Promise<void> => {
    const row = rows.find((entry) => entry.id === providerId);
    if (!row) return;

    setTestingProviderId(providerId);
    setError(null);
    setNotice(null);

    try {
      const result = await window.api.testProviderConnection({
        providerId: row.id,
        baseUrl: row.baseUrl,
      });

      if (!result.ok || !result.reachable) {
        throw new Error(result.error ?? "Provider connection test failed.");
      }

      setNotice(`${row.name} connection settings look valid.`);
    } catch (testError) {
      setError(`${row.name}: ${String(testError)}`);
    } finally {
      setTestingProviderId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Provider Configuration</CardTitle>
            <CardDescription>
              Configure provider endpoints, runtime auth mode, and secure API
              key metadata.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" />
            Add custom provider
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              {notice}
            </p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading provider settings...
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{row.name}</h3>
                      <Badge variant={row.isActive ? "secondary" : "outline"}>
                        {row.isActive ? "Enabled" : "Disabled"}
                      </Badge>
                      {row.isCustom ? (
                        <Badge variant="outline">Custom</Badge>
                      ) : null}
                      {row.hasApiKey ? (
                        <Badge className="gap-1">
                          <BadgeCheck className="size-3" />
                          Key configured
                        </Badge>
                      ) : (
                        <Badge variant="outline">No key</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Label htmlFor={`enabled-${row.id}`}>Enabled</Label>
                        <Switch
                          id={`enabled-${row.id}`}
                          checked={row.isActive}
                          onCheckedChange={(checked) =>
                            updateRow(row.id, { isActive: checked })
                          }
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void testConnection(row.id)}
                        disabled={testingProviderId === row.id}
                      >
                        <TestTubeDiagonal className="size-4" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void saveProvider(row.id)}
                        disabled={isSaving}
                      >
                        <Save className="size-4" />
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`base-url-${row.id}`}>Base URL</Label>
                      <Input
                        id={`base-url-${row.id}`}
                        value={row.baseUrl}
                        onChange={(event) =>
                          updateRow(row.id, { baseUrl: event.target.value })
                        }
                      />
                    </div>

                    {row.id === "ollama" && (
                      <div className="grid gap-2">
                        <Label>Ollama Mode</Label>
                        <Select
                          value={row.ollamaMode ?? "local"}
                          onValueChange={(value) =>
                            updateRow(row.id, {
                              ollamaMode: value as "local" | "cloud",
                              baseUrl:
                                value === "cloud"
                                  ? OLLAMA_CLOUD_URL
                                  : OLLAMA_LOCAL_URL,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="local">Local</SelectItem>
                            <SelectItem value="cloud">Cloud</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">API key</p>
                      <p className="text-muted-foreground">
                        {row.hasApiKey
                          ? "Stored securely in the main process"
                          : "Not configured"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated:{" "}
                        {row.keyUpdatedAt
                          ? new Date(row.keyUpdatedAt).toLocaleString()
                          : "Never"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Label htmlFor={`inject-${row.id}`}>
                          Proxy injects key
                        </Label>
                        <Switch
                          id={`inject-${row.id}`}
                          checked={row.authMode === "inject"}
                          onCheckedChange={(checked) =>
                            updateRow(row.id, {
                              authMode: checked ? "inject" : "passthrough",
                            })
                          }
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/settings/api-keys")}
                      >
                        <KeyRound className="size-4" />
                        Manage key
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPricingProviderId(row.id)}
                      >
                        <PencilLine className="size-4" />
                        Pricing
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddProviderDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddProvider={(provider) => {
          void handleAddCustomProvider(provider);
        }}
        existingProviderIds={Array.from(providerIdSet)}
      />

      <Dialog
        open={Boolean(pricingProviderId)}
        onOpenChange={(open) => {
          if (!open) setPricingProviderId(null);
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              Pricing for {pricingProviderId ?? "selected provider"}
            </DialogTitle>
            <DialogDescription>
              Override model pricing and persist overrides used by the cost
              engine.
            </DialogDescription>
          </DialogHeader>
          <PricingEditor providerId={pricingProviderId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
