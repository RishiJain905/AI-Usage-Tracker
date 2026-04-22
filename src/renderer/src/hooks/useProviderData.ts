import { useMemo, useCallback } from "react";
import { useUsageStore } from "@/stores/usageStore";
import type { ModelBreakdown, ProviderSummary } from "@/types/usage";

export interface ProviderAggregate {
  provider_id: string;
  provider_name: string;
  total_tokens: number;
  total_cost: number;
  total_input_cost: number;
  total_output_cost: number;
  request_count: number;
  model_count: number;
  models: ModelBreakdown[];
  isActive: boolean;
}

export function useProviderData(): {
  providers: ProviderAggregate[];
  providerSummaries: ProviderSummary[];
  isLoading: boolean;
  selectedProviderId: string | null;
  setSelectedProvider: (providerId: string | null) => void;
  fetchProviderDetail: (providerId: string) => Promise<void>;
  getProviderDetail: (providerId: string) => ProviderAggregate | undefined;
} {
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const providerBreakdown = useUsageStore((s) => s.providerBreakdown);
  const isLoading = useUsageStore((s) => s.isLoading);
  const selectedProviderId = useUsageStore((s) => s.selectedProvider);
  const setSelectedProvider = useUsageStore((s) => s.setSelectedProvider);
  const fetchProviderDetailAction = useUsageStore((s) => s.fetchProviderDetail);

  const providers = useMemo<ProviderAggregate[]>(() => {
    const providerMap = new Map<
      string,
      {
        provider_name: string;
        models: ModelBreakdown[];
        total_tokens: number;
        total_cost: number;
        total_input_cost: number;
        total_output_cost: number;
        request_count: number;
      }
    >();

    for (const m of modelBreakdown) {
      const existing = providerMap.get(m.provider_id);
      if (existing) {
        existing.models.push(m);
        existing.total_tokens += m.total_tokens;
        existing.total_cost += m.total_cost;
        existing.total_input_cost += m.input_cost;
        existing.total_output_cost += m.output_cost;
        existing.request_count += m.request_count;
      } else {
        providerMap.set(m.provider_id, {
          provider_name: m.provider_name,
          models: [m],
          total_tokens: m.total_tokens,
          total_cost: m.total_cost,
          total_input_cost: m.input_cost,
          total_output_cost: m.output_cost,
          request_count: m.request_count,
        });
      }
    }

    const result: ProviderAggregate[] = [];
    for (const [providerId, data] of providerMap) {
      result.push({
        provider_id: providerId,
        provider_name: data.provider_name,
        total_tokens: data.total_tokens,
        total_cost: data.total_cost,
        total_input_cost: data.total_input_cost,
        total_output_cost: data.total_output_cost,
        request_count: data.request_count,
        model_count: data.models.length,
        models: data.models.sort((a, b) => b.total_tokens - a.total_tokens),
        isActive: data.total_tokens > 0,
      });
    }

    return result.sort((a, b) => b.total_tokens - a.total_tokens);
  }, [modelBreakdown]);

  const fetchProviderDetail = useCallback(
    async (providerId: string) => {
      await fetchProviderDetailAction(providerId);
    },
    [fetchProviderDetailAction],
  );

  const getProviderDetail = useCallback(
    (providerId: string): ProviderAggregate | undefined => {
      return providers.find((p) => p.provider_id === providerId);
    },
    [providers],
  );

  return {
    providers,
    providerSummaries: providerBreakdown,
    isLoading,
    selectedProviderId,
    setSelectedProvider,
    fetchProviderDetail,
    getProviderDetail,
  };
}
