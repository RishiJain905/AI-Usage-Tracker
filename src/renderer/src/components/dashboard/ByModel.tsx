import { Zap, DollarSign, Activity } from "lucide-react";
import { useUsageStore } from "@/stores/usageStore";
import MetricCard from "@/components/dashboard/MetricCard";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import ModelBreakdownBar from "@/components/dashboard/ModelBreakdownBar";
import ModelRanking from "@/components/charts/ModelRanking";
import ModelTimeline from "@/components/charts/ModelTimeline";
import ModelComparison from "@/components/dashboard/ModelComparison";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useModelData } from "@/hooks/useModelData";
import { formatTokens, formatCost } from "@/lib/format";

export default function ByModel(): React.JSX.Element {
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);
  const modelDailyTrends = useUsageStore((s) => s.modelDailyTrends);
  const allModelSummaries = useUsageStore((s) => s.allModelSummaries);
  const error = useUsageStore((s) => s.error);
  const isLoading = useUsageStore((s) => s.isLoading);
  const setSelectedModel = useUsageStore((s) => s.setSelectedModel);

  const { modelRows } = useModelData();

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Failed to load model data"
          message={error}
          onRetry={() => useUsageStore.getState().fetchAll()}
        />
      </div>
    );
  }

  if (isLoading && !aggregateTotal) {
    return (
      <div className="space-y-6">
        <LoadingSpinner size="lg" message="Loading model data…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">By Model</h1>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {(!aggregateTotal && !isLoading) ||
      !modelBreakdown ||
      modelBreakdown.length === 0 ? (
        <EmptyState
          title="No model data"
          description="No model usage data available for the selected period."
        />
      ) : (
        <>
          {/* Grand total metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Total Tokens"
              value={
                aggregateTotal ? formatTokens(aggregateTotal.total_tokens) : "0"
              }
              icon={<Zap className="size-4" />}
            />
            <MetricCard
              title="Total Cost"
              value={
                aggregateTotal ? formatCost(aggregateTotal.total_cost) : "$0.00"
              }
              icon={<DollarSign className="size-4" />}
            />
            <MetricCard
              title="Total Requests"
              value={
                aggregateTotal
                  ? aggregateTotal.request_count.toLocaleString()
                  : "0"
              }
              icon={<Activity className="size-4" />}
            />
          </div>

          {/* Per-model breakdown */}
          <ModelBreakdownBar models={modelBreakdown ?? []} period={period} />

          {/* Model ranking chart */}
          <ModelRanking
            models={modelRows}
            period={period}
            onModelClick={(id) => setSelectedModel(id)}
          />

          {/* Model comparison table */}
          <ModelComparison period={period} />

          {/* Model timeline chart */}
          <ModelTimeline
            data={dailyTrend ?? []}
            modelTrends={modelDailyTrends}
            period={period}
            allModelSummaries={allModelSummaries ?? []}
          />
        </>
      )}
    </div>
  );
}
