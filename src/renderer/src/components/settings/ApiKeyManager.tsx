import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApiKeyMetadata {
  providerId: string;
  providerName: string;
  baseUrl: string;
  isActive: boolean;
  hasKey: boolean;
  authMode: "passthrough" | "inject";
  keyUpdatedAt: string | null;
}

function statusBadgeVariant(
  hasKey: boolean,
): "default" | "outline" | "secondary" {
  return hasKey ? "default" : "outline";
}

export default function ApiKeyManager(): React.JSX.Element {
  const [providers, setProviders] = useState<ApiKeyMetadata[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("openai");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const providerMap = useMemo(() => {
    return new Map(providers.map((entry) => [entry.providerId, entry]));
  }, [providers]);

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) =>
      a.providerName.localeCompare(b.providerName),
    );
  }, [providers]);

  const selectedProvider = providerMap.get(selectedProviderId) ?? null;

  const loadProviders = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const metadata = await window.api.listApiKeyMetadata();
      setProviders(metadata);
      setSelectedProviderId((current) => {
        if (metadata.some((entry) => entry.providerId === current)) {
          return current;
        }
        return metadata[0]?.providerId ?? "openai";
      });
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviders();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProviders]);

  const saveApiKey = async (): Promise<void> => {
    const providerId = selectedProviderId.trim();
    const apiKey = apiKeyInput.trim();

    if (!providerId) {
      setError("Select a provider before saving a key.");
      return;
    }
    if (!apiKey) {
      setError("API key value is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await window.api.setApiKey({
        providerId,
        apiKey,
        authMode: selectedProvider?.authMode ?? "passthrough",
      });

      if (!result.ok) {
        throw new Error("Unable to save API key.");
      }

      setApiKeyInput("");
      setNotice(
        `Saved API key for ${selectedProvider?.providerName ?? providerId}.`,
      );
      await loadProviders();
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteApiKey = async (providerId: string): Promise<void> => {
    const provider = providerMap.get(providerId);
    if (!provider) return;

    const confirmed = window.confirm(
      `Delete the stored API key for ${provider.providerName}?`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await window.api.deleteApiKey(providerId);
      if (!result.ok) {
        throw new Error("Unable to delete API key.");
      }

      setNotice(`Deleted API key for ${provider.providerName}.`);
      await loadProviders();
    } catch (deleteError) {
      setError(String(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const testProvider = async (providerId: string): Promise<void> => {
    const provider = providerMap.get(providerId);
    if (!provider) return;

    setTestingProviderId(providerId);
    setError(null);
    setNotice(null);

    try {
      const result = await window.api.testProviderConnection({
        providerId,
        baseUrl: provider.baseUrl,
      });

      if (!result.ok || !result.reachable) {
        throw new Error(result.error ?? "Connection test failed.");
      }

      setNotice(`Connection test passed for ${provider.providerName}.`);
    } catch (testError) {
      setError(`${provider.providerName}: ${String(testError)}`);
    } finally {
      setTestingProviderId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>API Key Manager</CardTitle>
          <CardDescription>
            Store provider keys securely in the main process and test provider
            connectivity from runtime metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-emerald-300/40 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/30 dark:bg-emerald-950/20 dark:text-emerald-200">
            Keys are never echoed back to the renderer. Save, replace, and
            delete them through the secure IPC API only.
          </div>

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

          <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[220px_1fr_auto]">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select
                value={selectedProviderId}
                onValueChange={(value) => {
                  setSelectedProviderId(value);
                  setApiKeyInput("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortedProviders.map((provider) => (
                    <SelectItem
                      key={provider.providerId}
                      value={provider.providerId}
                    >
                      {provider.providerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-input">API key</Label>
              <Input
                id="api-key-input"
                type="password"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder="Paste API key"
                autoComplete="off"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => void saveApiKey()}
                disabled={isSaving || isLoading}
              >
                <Plus className="size-4" />
                Save key
              </Button>
            </div>
          </div>

          {selectedProvider && (
            <div className="grid gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current status
                </p>
                <p>
                  {selectedProvider.hasKey ? "Key stored" : "No key stored"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Auth mode
                </p>
                <p>
                  {selectedProvider.authMode === "inject"
                    ? "Inject"
                    : "Pass-through"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Last updated
                </p>
                <p>
                  {selectedProvider.keyUpdatedAt
                    ? new Date(selectedProvider.keyUpdatedAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading key metadata...
            </p>
          ) : sortedProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers available yet.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedProviders.map((provider) => (
                <div
                  key={provider.providerId}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{provider.providerName}</p>
                        <Badge variant={statusBadgeVariant(provider.hasKey)}>
                          {provider.hasKey ? "Configured" : "Missing"}
                        </Badge>
                        <Badge variant="outline">
                          {provider.authMode === "inject"
                            ? "Inject mode"
                            : "Pass-through"}
                        </Badge>
                        {!provider.isActive && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {provider.baseUrl}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated:{" "}
                        {provider.keyUpdatedAt
                          ? new Date(provider.keyUpdatedAt).toLocaleString()
                          : "Never"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void testProvider(provider.providerId)}
                        disabled={testingProviderId === provider.providerId}
                      >
                        <ShieldCheck className="size-4" />
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedProviderId(provider.providerId);
                          setApiKeyInput("");
                        }}
                        disabled={isSaving}
                      >
                        <Eye className="size-4" />
                        Set key
                      </Button>
                      {provider.hasKey && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void deleteApiKey(provider.providerId)}
                          disabled={isSaving}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
