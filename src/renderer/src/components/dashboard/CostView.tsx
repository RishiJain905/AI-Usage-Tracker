import { useEffect, useMemo } from "react";
import { DollarSign, TrendingUp, Activity, Wallet } from "lucide-react";
import { useUsageStore } from "@/stores/usageStore";
import MetricCard from "@/components/dashboard/MetricCard";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import CostTimeline from "@/components/charts/CostTimeline";
import CostByProvider from "@/components/charts/CostByProvider";
import CostByModel from "@/components/charts/CostByModel";
import BudgetTracker from "@/components/dashboard/BudgetTracker";
import CostProjection from "@/components/dashboard/CostProjection";
import DailyCostTable from "@/components/dashboard/DailyCostTable";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatCost, formatTokens } from "@/lib/format";
import type { ProviderSummary } from "@/types/usage";
import type { TrendData } from "@/components/dashboard/MetricCard";

function getPeriodLabel(period: string): string {
  switch (period) {
    case "today":
      return "Today's Cost";
    case "week":
      return "This Week's Cost";
    case "month":
      return "This Month's Cost";
    case "all":
      return "All Time Cost";
    default:
      return "Total Cost";
  }
}

/** Compute a simple trend by comparing the last two entries in dailyTrend. */
function computeTrend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[],
  field: string,
): TrendData | undefined {
  if (!data || data.length < 2) return undefined;

  const current = data[data.length - 1][field];
  const previous = data[data.length - 2][field];

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

export default function CostView(): React.JSX.Element {
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);
  const modelDailyTrends = useUsageStore((s) => s.modelDailyTrends);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const allModelSummaries = useUsageStore((s) => s.allModelSummaries);
  const dailySummaries = useUsageStore((s) => s.dailySummaries);
  const isLoading = useUsageStore((s) => s.isLoading);
  const error = useUsageStore((s) => s.error);
  const fetchAll = useUsageStore((s) => s.fetchAll);
  const fetchDailySummaries = useUsageStore((s) => s.fetchDailySummaries);
  const setupEventListeners = useUsageStore((s) => s.setupEventListeners);

  // Compute provider summary data from modelBreakdown
  const providerSummaryData: ProviderSummary[] = useMemo(() => {
    if (!modelBreakdown || modelBreakdown.length === 0) return [];

    return modelBreakdown.reduce((acc, m) => {
      const existing = acc.find((p) => p.provider_id === m.provider_id);
      if (existing) {
        existing.total_tokens += m.total_tokens;
        existing.total_cost += m.total_cost;
        existing.request_count += m.request_count;
        existing.model_count += 1;
      } else {
        acc.push({
          provider_id: m.provider_id,
          provider_name: m.provider_name,
          total_tokens: m.total_tokens,
          total_cost: m.total_cost,
          request_count: m.request_count,
          model_count: 1,
        });
      }
      return acc;
    }, [] as ProviderSummary[]);
  }, [modelBreakdown]);

  // Trend from dailyTrend
  const costTrend = useMemo(
    () => computeTrend(dailyTrend, "total_cost"),
    [dailyTrend],
  );

  // Initial fetch and event listeners
  useEffect(() => {
    fetchAll();
    fetchDailySummaries();
    const cleanup = setupEventListeners();
    return cleanup;
  }, [fetchAll, fetchDailySummaries, setupEventListeners]);

  // Re-fetch daily summaries when period changes
  useEffect(() => {
    fetchDailySummaries();
  }, [period, fetchDailySummaries]);

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Failed to load cost data"
          message={error}
          onRetry={() => {
            fetchAll();
            fetchDailySummaries();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Cost Tracking</h1>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* Loading state */}
      {isLoading && !aggregateTotal ? (
        <LoadingSpinner size="lg" message="Loading cost data…" />
      ) : (
        <>
          {/* Summary metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title={getPeriodLabel(period)}
              value={
                aggregateTotal ? formatCost(aggregateTotal.total_cost) : "$0.00"
              }
              trend={costTrend}
              icon={<DollarSign className="size-4" />}
            />
            <MetricCard
              title="Input Cost"
              value={
                aggregateTotal ? formatCost(aggregateTotal.input_cost) : "$0.00"
              }
              icon={<TrendingUp className="size-4" />}
            />
            <MetricCard
              title="Output Cost"
              value={
                aggregateTotal
                  ? formatCost(aggregateTotal.output_cost)
                  : "$0.00"
              }
              icon={<Wallet className="size-4" />}
            />
            <MetricCard
              title="Requests"
              value={
                aggregateTotal
                  ? formatTokens(aggregateTotal.request_count)
                  : "0"
              }
              trend={computeTrend(dailyTrend, "request_count")}
              icon={<Activity className="size-4" />}
            />
          </div>

          {/* Cost Timeline chart */}
          <CostTimeline
            data={dailyTrend}
            modelTrends={modelDailyTrends}
            period={period}
          />

          {/* Two-column: CostByProvider + CostByModel */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CostByProvider data={providerSummaryData} />
            <CostByModel models={allModelSummaries} period={period} />
          </div>

          {/* Budget Tracker */}
          <BudgetTracker currentSpend={aggregateTotal?.total_cost ?? 0} />

          {/* Cost Projection */}
          <CostProjection dailyTrend={dailyTrend} period={period} />

          {/* Daily Cost Table */}
          <DailyCostTable
            summaries={dailySummaries}
            modelBreakdown={modelBreakdown}
            period={period}
          />
        </>
      )}
    </div>
  );
}
