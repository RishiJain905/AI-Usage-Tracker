import { Zap, DollarSign, Activity, Server } from "lucide-react";
import { useUsageStore } from "@/stores/usageStore";
import { useOverviewData } from "@/hooks/useUsageData";
import MetricCard from "@/components/dashboard/MetricCard";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import ModelBreakdownBar from "@/components/dashboard/ModelBreakdownBar";
import UsageTimeline from "@/components/charts/UsageTimeline";
import ProviderBreakdown from "@/components/charts/ProviderBreakdown";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function Overview(): React.JSX.Element {
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);
  const modelDailyTrends = useUsageStore((s) => s.modelDailyTrends);
  const summary = useUsageStore((s) => s.summary);

  const { metrics, recentLogs, isLoading, error, refetch } = useOverviewData();

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Failed to load dashboard"
          message={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with title and period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* Loading state */}
      {isLoading && !aggregateTotal ? (
        <LoadingSpinner size="lg" message="Loading usage data…" />
      ) : (
        <>
          {/* Aggregate metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Tokens (All Models)"
              value={metrics?.totalTokens ?? "0"}
              subtitle={
                modelBreakdown && modelBreakdown.length > 0
                  ? modelBreakdown.map((m) => m.model_name).join(" + ")
                  : undefined
              }
              trend={metrics?.totalTokensTrend}
              icon={<Zap className="size-4" />}
            />
            <MetricCard
              title="Total Cost"
              value={metrics?.totalCost ?? "$0.00"}
              trend={metrics?.totalCostTrend}
              icon={<DollarSign className="size-4" />}
            />
            <MetricCard
              title="Total Requests"
              value={metrics?.totalRequests ?? "0"}
              trend={metrics?.totalRequestsTrend}
              icon={<Activity className="size-4" />}
            />
            <MetricCard
              title="Active Providers"
              value={
                summary?.unique_providers != null
                  ? String(summary.unique_providers)
                  : "0"
              }
              subtitle={metrics?.activeProviders || undefined}
              icon={<Server className="size-4" />}
            />
          </div>

          {/* Per-model breakdown */}
          <ModelBreakdownBar models={modelBreakdown ?? []} period={period} />

          {/* Token usage timeline */}
          <UsageTimeline
            data={dailyTrend ?? []}
            modelTrends={modelDailyTrends}
            period={period}
          />

          {/* Provider breakdown side by side */}
          {summary && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProviderBreakdown
                type="tokens"
                data={
                  aggregateTotal
                    ? (modelBreakdown?.reduce(
                        (acc, m) => {
                          const existing = acc.find(
                            (p) => p.provider_id === m.provider_id,
                          );
                          if (existing) {
                            existing.total_tokens += m.total_tokens;
                            existing.total_cost += m.total_cost;
                            existing.request_count += m.request_count;
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
                        },
                        [] as {
                          provider_id: string;
                          provider_name: string;
                          total_tokens: number;
                          total_cost: number;
                          request_count: number;
                          model_count: number;
                        }[],
                      ) ?? [])
                    : []
                }
              />
              <ProviderBreakdown
                type="cost"
                data={
                  aggregateTotal
                    ? (modelBreakdown?.reduce(
                        (acc, m) => {
                          const existing = acc.find(
                            (p) => p.provider_id === m.provider_id,
                          );
                          if (existing) {
                            existing.total_tokens += m.total_tokens;
                            existing.total_cost += m.total_cost;
                            existing.request_count += m.request_count;
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
                        },
                        [] as {
                          provider_id: string;
                          provider_name: string;
                          total_tokens: number;
                          total_cost: number;
                          request_count: number;
                          model_count: number;
                        }[],
                      ) ?? [])
                    : []
                }
              />
            </div>
          )}

          {/* Recent activity */}
          <RecentActivity logs={recentLogs} loading={isLoading} />
        </>
      )}
    </div>
  );
}
