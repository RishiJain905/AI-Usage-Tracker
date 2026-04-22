import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, RotateCcw, Save } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PricingEditorProps {
  providerId?: string | null;
}

interface ModelRow {
  modelId: string;
  providerId: string;
  providerName: string;
  modelName: string;
  defaultInput: number;
  defaultOutput: number;
  isLocal: boolean;
}

interface PricingOverride {
  providerId: string;
  modelId: string;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  isLocal?: boolean;
}

interface DraftPricing {
  input: string;
  output: string;
}

const PRICING_OVERRIDES_KEY = "pricing_overrides";
const LAST_PRICING_UPDATE_KEY = "last_pricing_update";

function pricingKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function parsePricingOverrides(value: string | null): PricingOverride[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is PricingOverride => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.providerId === "string" &&
        typeof candidate.modelId === "string"
      );
    });
  } catch {
    return [];
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default function PricingEditor({
  providerId = null,
}: PricingEditorProps): React.JSX.Element {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [overrides, setOverrides] = useState<PricingOverride[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPricing>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleModels = useMemo(() => {
    if (!providerId) return models;
    return models.filter((entry) => entry.providerId === providerId);
  }, [models, providerId]);

  const hydrateDrafts = useCallback(
    (rows: ModelRow[], currentOverrides: PricingOverride[]): void => {
      const nextDrafts: Record<string, DraftPricing> = {};
      const nextOverrideMap = new Map<string, PricingOverride>();
      for (const entry of currentOverrides) {
        nextOverrideMap.set(pricingKey(entry.providerId, entry.modelId), entry);
      }

      for (const row of rows) {
        const key = pricingKey(row.providerId, row.modelId);
        const override = nextOverrideMap.get(key);
        const input =
          override?.inputCostPerMillion ?? row.defaultInput;
        const output =
          override?.outputCostPerMillion ?? row.defaultOutput;

        nextDrafts[key] = {
          input: String(input),
          output: String(output),
        };
      }
      setDrafts(nextDrafts);
    },
    [],
  );

  const loadPricingData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [rawModels, rawOverrides, rawLastUpdated] = await Promise.all([
        window.api.dbGetModels(),
        window.api.dbGetSetting(PRICING_OVERRIDES_KEY),
        window.api.dbGetSetting(LAST_PRICING_UPDATE_KEY),
      ]);

      const mappedModels: ModelRow[] = rawModels.map((entry) => ({
        modelId: entry.id,
        providerId: entry.provider_id,
        providerName: entry.provider_name,
        modelName: entry.name,
        defaultInput: entry.input_price_per_million,
        defaultOutput: entry.output_price_per_million,
        isLocal: entry.is_local === 1,
      }));

      const parsedOverrides = parsePricingOverrides(rawOverrides);

      setModels(mappedModels);
      setOverrides(parsedOverrides);
      setLastUpdated(rawLastUpdated);
      hydrateDrafts(mappedModels, parsedOverrides);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [hydrateDrafts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPricingData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPricingData]);

  const persistOverrides = useCallback(
    async (nextOverrides: PricingOverride[], message: string): Promise<void> => {
      setIsSaving(true);
      setError(null);
      setNotice(null);

      try {
        const timestamp = new Date().toISOString();
        await window.api.dbSetSetting(
          PRICING_OVERRIDES_KEY,
          JSON.stringify(nextOverrides),
        );
        await window.api.dbSetSetting(LAST_PRICING_UPDATE_KEY, timestamp);
        setOverrides(nextOverrides);
        setLastUpdated(timestamp);
        setNotice(message);
      } catch (saveError) {
        setError(String(saveError));
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const saveDrafts = async (): Promise<void> => {
    const nextOverrideMap = new Map<string, PricingOverride>();
    for (const entry of overrides) {
      nextOverrideMap.set(pricingKey(entry.providerId, entry.modelId), entry);
    }

    for (const row of visibleModels) {
      const key = pricingKey(row.providerId, row.modelId);
      const draft = drafts[key];
      if (!draft) continue;

      const parsedInput = Number(draft.input);
      const parsedOutput = Number(draft.output);

      if (
        !Number.isFinite(parsedInput) ||
        !Number.isFinite(parsedOutput) ||
        parsedInput < 0 ||
        parsedOutput < 0
      ) {
        setError(
          `Invalid pricing values for ${row.modelName}. Use numbers greater than or equal to 0.`,
        );
        return;
      }

      const hasOverride =
        parsedInput !== row.defaultInput || parsedOutput !== row.defaultOutput;

      if (hasOverride) {
        nextOverrideMap.set(key, {
          providerId: row.providerId,
          modelId: row.modelId,
          inputCostPerMillion: parsedInput,
          outputCostPerMillion: parsedOutput,
          isLocal: row.isLocal,
        });
      } else {
        nextOverrideMap.delete(key);
      }
    }

    await persistOverrides(
      Array.from(nextOverrideMap.values()),
      "Pricing overrides saved.",
    );
  };

  const resetVisibleModels = async (): Promise<void> => {
    const visibleKeys = new Set(
      visibleModels.map((entry) => pricingKey(entry.providerId, entry.modelId)),
    );
    const nextOverrides = overrides.filter(
      (entry) => !visibleKeys.has(pricingKey(entry.providerId, entry.modelId)),
    );

    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of visibleModels) {
        const key = pricingKey(row.providerId, row.modelId);
        next[key] = {
          input: String(row.defaultInput),
          output: String(row.defaultOutput),
        };
      }
      return next;
    });

    await persistOverrides(nextOverrides, "Pricing reset to defaults.");
  };

  const fetchLatestPricing = async (): Promise<void> => {
    await loadPricingData();
    setNotice(
      "Pricing refreshed from local model catalog. Remote provider sync is not wired in this build.",
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Pricing Editor</CardTitle>
          <CardDescription>
            Edit input/output token pricing per model. Values are USD per
            million tokens.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchLatestPricing()}
            disabled={isLoading || isSaving}
          >
            <RefreshCcw className="size-4" />
            Fetch latest pricing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void resetVisibleModels()}
            disabled={isLoading || isSaving || visibleModels.length === 0}
          >
            <RotateCcw className="size-4" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={() => void saveDrafts()}
            disabled={isLoading || isSaving || visibleModels.length === 0}
          >
            <Save className="size-4" />
            Save changes
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Last updated:{" "}
            {lastUpdated
              ? new Date(lastUpdated).toLocaleString()
              : "Never"}
          </span>
          {providerId && <Badge variant="outline">Filtered by {providerId}</Badge>}
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            {notice}
          </p>
        )}

        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Default Input</TableHead>
              <TableHead>Default Output</TableHead>
              <TableHead>Input Override</TableHead>
              <TableHead>Output Override</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading pricing catalog...
                </TableCell>
              </TableRow>
            ) : visibleModels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No models available for this provider.
                </TableCell>
              </TableRow>
            ) : (
              visibleModels.map((row) => {
                const key = pricingKey(row.providerId, row.modelId);
                const draft = drafts[key] ?? {
                  input: String(row.defaultInput),
                  output: String(row.defaultOutput),
                };
                const parsedInput = Number(draft.input);
                const parsedOutput = Number(draft.output);
                const hasOverride =
                  Number.isFinite(parsedInput) &&
                  Number.isFinite(parsedOutput) &&
                  (parsedInput !== row.defaultInput ||
                    parsedOutput !== row.defaultOutput);

                return (
                  <TableRow key={key} data-state={hasOverride ? "selected" : undefined}>
                    <TableCell>{row.providerName}</TableCell>
                    <TableCell>{row.modelName}</TableCell>
                    <TableCell>{formatCurrency(row.defaultInput)}</TableCell>
                    <TableCell>{formatCurrency(row.defaultOutput)}</TableCell>
                    <TableCell>
                      <Input
                        value={draft.input}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: {
                              ...prev[key],
                              input: e.target.value,
                              output: prev[key]?.output ?? draft.output,
                            },
                          }))
                        }
                        className="h-8 w-28"
                        inputMode="decimal"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.output}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: {
                              ...prev[key],
                              input: prev[key]?.input ?? draft.input,
                              output: e.target.value,
                            },
                          }))
                        }
                        className="h-8 w-28"
                        inputMode="decimal"
                      />
                    </TableCell>
                    <TableCell>
                      {row.isLocal ? (
                        <Badge variant="outline">Local model</Badge>
                      ) : hasOverride ? (
                        <Badge>Custom</Badge>
                      ) : (
                        <Badge variant="outline">Default</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
