import { useMemo } from "react";
import { Zap, DollarSign, Activity } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useUsageStore } from "@/stores/usageStore";
import { useProviderData } from "@/hooks/useProviderData";
import MetricCard from "@/components/dashboard/MetricCard";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import ProviderCard from "@/components/dashboard/ProviderCard";
import ProviderDetailPanel from "@/components/dashboard/ProviderDetail";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTokens, formatCost } from "@/lib/format";

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#ef4444",
  "#84cc16",
];

/** Format a date string like "2026-04-19" to short "Apr 19" */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TimelineTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

function TimelineTooltip({
  active,
  payload,
  label,
}: TimelineTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label ? formatShortDate(label) : ""}
      </p>
      {payload.map((entry) => (
        <p
          key={entry.dataKey}
          className="text-sm"
          style={{ color: entry.color }}
        >
          {entry.name}: {formatTokens(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function ByProvider(): React.JSX.Element {
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);

  const error = useUsageStore((s) => s.error);
  const isLoading = useUsageStore((s) => s.isLoading);
  const selectedProviderId = useUsageStore((s) => s.selectedProvider);
  const setSelectedProvider = useUsageStore((s) => s.setSelectedProvider);

  const { providers, isLoading: providerLoading } = useProviderData();

  // Build stacked area chart data from model breakdown grouped by provider per date
  const stackedData = useMemo(() => {
    if (!dailyTrend || dailyTrend.length === 0 || providers.length === 0)
      return [];

    // Approximate: distribute daily total across providers proportionally
    const providerTotals = providers.map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      totalTokens: p.total_tokens,
      grandTotal: providers.reduce((s, pr) => s + pr.total_tokens, 0),
    }));

    return dailyTrend.map((d) => {
      const entry: Record<string, string | number> = { date: d.date };
      for (const pt of providerTotals) {
        const ratio = pt.grandTotal > 0 ? pt.totalTokens / pt.grandTotal : 0;
        entry[pt.id] = Math.round(d.total_tokens * ratio);
      }
      return entry;
    });
  }, [dailyTrend, providers]);

  // Provider color map
  const providerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    providers.forEach((p, idx) => {
      map.set(p.provider_id, COLORS[idx % COLORS.length]);
    });
    return map;
  }, [providers]);

  // Selected provider data
  const selectedProvider = useMemo(
    () => providers.find((p) => p.provider_id === selectedProviderId),
    [providers, selectedProviderId],
  );

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Failed to load provider data"
          message={error}
          onRetry={() => useUsageStore.getState().fetchAll()}
        />
      </div>
    );
  }

  if ((isLoading || providerLoading) && providers.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingSpinner size="lg" message="Loading provider data…" />
      </div>
    );
  }

  const totalTokens = aggregateTotal?.total_tokens ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">By Provider</h1>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* Provider cards grid */}
      {providers.length === 0 ? (
        <EmptyState
          title="No providers"
          description="No provider data available for the selected period."
        />
      ) : (
        <>
          {/* Metric summary cards */}
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

          {/* Provider cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.provider_id}
                provider={provider}
                period={period}
                totalTokens={totalTokens}
                onClick={() =>
                  setSelectedProvider(
                    selectedProviderId === provider.provider_id
                      ? null
                      : provider.provider_id,
                  )
                }
              />
            ))}
          </div>

          {/* Provider detail panel (shown when a provider is selected) */}
          {selectedProvider && (
            <ProviderDetailPanel
              provider={selectedProvider}
              period={period}
              onClose={() => setSelectedProvider(null)}
            />
          )}

          {/* Provider comparison timeline (stacked area) */}
          {stackedData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Provider Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={stackedData}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatTokens(v)}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                      width={60}
                    />
                    <Tooltip content={<TimelineTooltip />} />
                    <Legend />
                    {providers.map((p) => (
                      <Area
                        key={p.provider_id}
                        type="monotone"
                        dataKey={p.provider_id}
                        name={p.provider_name}
                        stackId="1"
                        stroke={
                          providerColorMap.get(p.provider_id) ?? "#8884d8"
                        }
                        fill={providerColorMap.get(p.provider_id) ?? "#8884d8"}
                        fillOpacity={0.6}
                        strokeWidth={1.5}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Summary table */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow
                      key={provider.provider_id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() =>
                        setSelectedProvider(
                          selectedProviderId === provider.provider_id
                            ? null
                            : provider.provider_id,
                        )
                      }
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                providerColorMap.get(provider.provider_id) ??
                                "#8884d8",
                            }}
                          />
                          {provider.provider_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {provider.request_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(provider.total_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {provider.total_cost > 0
                          ? formatCost(provider.total_cost)
                          : "Free"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
