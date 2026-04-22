import { useMemo, useCallback, useState } from "react";
import { useUsageStore } from "@/stores/usageStore";
import type { ModelComparisonRow } from "@/types/usage";

type SortField =
  | "model_name"
  | "provider_name"
  | "total_tokens"
  | "total_cost"
  | "request_count"
  | "share_of_total"
  | "input_price_per_million"
  | "output_price_per_million";

type SortDirection = "asc" | "desc";

export function useModelData(providerId?: string): {
  modelRows: ModelComparisonRow[];
  totalTokens: number;
  totalCost: number;
  sortField: SortField;
  sortDirection: SortDirection;
  setSortField: (field: SortField) => void;
  toggleSortDirection: () => void;
  setProviderFilter: (providerId: string | null) => void;
} {
  const allModelSummaries = useUsageStore((s) => s.allModelSummaries);
  const models = useUsageStore((s) => s.models);

  const [sortField, setSortField] = useState<SortField>("total_tokens");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [providerFilter, setProviderFilter] = useState<string | null>(
    providerId ?? null,
  );

  const pricingMap = useMemo(() => {
    const map = new Map<
      string,
      { input: number; output: number; providerName: string }
    >();
    for (const m of models) {
      map.set(m.id, {
        input: m.inputPricePerMillion,
        output: m.outputPricePerMillion,
        providerName: m.providerId,
      });
    }
    return map;
  }, [models]);

  const { modelRows, totalTokens, totalCost } = useMemo(() => {
    const filtered = providerFilter
      ? allModelSummaries.filter((m) => m.provider_id === providerFilter)
      : allModelSummaries;

    const tokenTotal = filtered.reduce((sum, m) => sum + m.total_tokens, 0);

    const rows: ModelComparisonRow[] = filtered.map((m) => {
      const pricing = pricingMap.get(m.model_id);
      return {
        model_id: m.model_id,
        model_name: m.model_name,
        provider_id: m.provider_id,
        provider_name: m.provider_name,
        input_price_per_million: pricing?.input ?? 0,
        output_price_per_million: pricing?.output ?? 0,
        total_tokens: m.total_tokens,
        total_cost: m.total_cost,
        request_count: m.request_count,
        share_of_total:
          tokenTotal > 0 ? (m.total_tokens / tokenTotal) * 100 : 0,
      };
    });

    const costTotal = filtered.reduce((sum, m) => sum + m.total_cost, 0);

    return { modelRows: rows, totalTokens: tokenTotal, totalCost: costTotal };
  }, [allModelSummaries, providerFilter, pricingMap]);

  const sortedRows = useMemo(() => {
    const sorted = [...modelRows].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });
    return sorted;
  }, [modelRows, sortField, sortDirection]);

  const handleSetSortField = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField],
  );

  const toggleSortDirection = useCallback(() => {
    setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
  }, []);

  const setProviderFilterHandler = useCallback((id: string | null) => {
    setProviderFilter(id);
  }, []);

  return {
    modelRows: sortedRows,
    totalTokens,
    totalCost,
    sortField,
    sortDirection,
    setSortField: handleSetSortField,
    toggleSortDirection,
    setProviderFilter: setProviderFilterHandler,
  };
}
