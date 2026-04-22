import { useEffect, useRef, useCallback, useState } from "react";
import { useUsageStore } from "@/stores/usageStore";
import type { UsageLog, DailyTrend } from "@/types/usage";

const DEBOUNCE_MS = 2000;

export interface OverviewMetrics {
  totalTokens: string;
  totalCost: string;
  totalRequests: string;
  activeProviders: string;
  totalTokensTrend: { direction: "up" | "down" | "flat"; percentage: number };
  totalCostTrend: { direction: "up" | "down" | "flat"; percentage: number };
  totalRequestsTrend: { direction: "up" | "down" | "flat"; percentage: number };
}

/**
 * Compute a simple trend by comparing the last value in the daily trend
 * to the day before it.
 */
function computeTrend(
  trend: DailyTrend[],
  field: "total_tokens" | "total_cost" | "request_count",
): { direction: "up" | "down" | "flat"; percentage: number } {
  if (!trend || trend.length < 2) {
    return { direction: "flat", percentage: 0 };
  }

  const current = trend[trend.length - 1][field];
  const previous = trend[trend.length - 2][field];

  if (previous === 0) {
    return current > 0
      ? { direction: "up", percentage: 100 }
      : { direction: "flat", percentage: 0 };
  }

  const pctChange = ((current - previous) / previous) * 100;

  if (Math.abs(pctChange) < 0.5) {
    return { direction: "flat", percentage: 0 };
  }

  return {
    direction: pctChange > 0 ? "up" : "down",
    percentage: Math.abs(pctChange),
  };
}

/**
 * Custom hook that composes usageStore data for the Overview page.
 * Provides formatted metrics, recent logs, and debounced real-time updates.
 */
export function useOverviewData(): {
  metrics: OverviewMetrics | null;
  recentLogs: UsageLog[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);
  const isLoading = useUsageStore((s) => s.isLoading);
  const error = useUsageStore((s) => s.error);
  const fetchAll = useUsageStore((s) => s.fetchAll);
  const fetchAggregateTotal = useUsageStore((s) => s.fetchAggregateTotal);
  const fetchModelBreakdown = useUsageStore((s) => s.fetchModelBreakdown);
  const fetchDailyTrend = useUsageStore((s) => s.fetchDailyTrend);
  const fetchTopModels = useUsageStore((s) => s.fetchTopModels);

  const [recentLogs, setRecentLogs] = useState<UsageLog[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Computed metrics from aggregateTotal
  const metrics: OverviewMetrics | null = aggregateTotal
    ? {
        totalTokens: aggregateTotal.total_tokens.toLocaleString(),
        totalCost: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(aggregateTotal.total_cost),
        totalRequests: aggregateTotal.request_count.toLocaleString(),
        activeProviders: modelBreakdown
          ? [...new Set(modelBreakdown.map((m) => m.provider_name))].join(", ")
          : "",
        totalTokensTrend: computeTrend(dailyTrend, "total_tokens"),
        totalCostTrend: computeTrend(dailyTrend, "total_cost"),
        totalRequestsTrend: computeTrend(dailyTrend, "request_count"),
      }
    : null;

  // Fetch recent logs from IPC
  const fetchRecentLogs = useCallback(async () => {
    const api = (window as any)?.api; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!api?.dbGetRecentLogs) return;
    try {
      const logs: UsageLog[] = await api.dbGetRecentLogs(50);
      if (logs) setRecentLogs(logs);
    } catch {
      // Silently fail — logs are non-critical
    }
  }, []);

  // Debounced refresh handler for real-time updates
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchAggregateTotal();
      fetchModelBreakdown();
      fetchDailyTrend();
      fetchTopModels();
      fetchRecentLogs();
    }, DEBOUNCE_MS);
  }, [
    fetchAggregateTotal,
    fetchModelBreakdown,
    fetchDailyTrend,
    fetchTopModels,
    fetchRecentLogs,
  ]);

  // Initial data fetch — use requestAnimationFrame to avoid
  // synchronous setState within effect (React 19 strict rule)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      fetchAll();
      fetchRecentLogs();
    });
    return () => cancelAnimationFrame(raf);
  }, [fetchAll, fetchRecentLogs]);

  // Listen for usage-updated events with debounce
  useEffect(() => {
    const api = (window as any)?.api; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!api?.onUsageUpdated) return;

    const unsub = api.onUsageUpdated(() => {
      debouncedRefresh();
    });

    return () => {
      unsub();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [debouncedRefresh]);

  return {
    metrics,
    recentLogs,
    isLoading,
    error,
    refetch: () => {
      fetchAll();
      fetchRecentLogs();
    },
  };
}

/**
 * Original useUsageData hook — kept for backward compatibility.
 * Returns the overview data hook by default.
 */
export function useUsageData(): ReturnType<typeof useOverviewData> {
  return useOverviewData();
}
