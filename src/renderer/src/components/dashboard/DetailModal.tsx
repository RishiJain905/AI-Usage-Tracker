import { useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatTokens, formatCost, formatPercentage } from "@/lib/format";
import { useUsageStore } from "@/stores/usageStore";

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

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "provider" | "model";
  id: string | null;
}

/** Format a date string like "2026-04-19" to short "Apr 19" */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface MiniTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

function MiniTooltip({
  active,
  payload,
  label,
}: MiniTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label ? formatShortDate(label) : ""}
      </p>
      <p className="text-sm">{formatTokens(payload[0].value)}</p>
    </div>
  );
}

export default function DetailModal({
  open,
  onOpenChange,
  type,
  id,
}: DetailModalProps): React.JSX.Element {
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const allModelSummaries = useUsageStore((s) => s.allModelSummaries);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);
  const providerDetail = useUsageStore((s) => s.providerDetail);
  const fetchProviderDetail = useUsageStore((s) => s.fetchProviderDetail);

  // Fetch provider detail when type is provider
  useEffect(() => {
    if (type === "provider" && id) {
      fetchProviderDetail(id);
    }
  }, [type, id, fetchProviderDetail]);

  // Provider data
  const providerData = useMemo(() => {
    if (type !== "provider" || !id) return null;
    const detail = providerDetail[id];
    const summary = modelBreakdown.find((m) => m.provider_id === id);
    if (!summary && !detail) return null;

    const models =
      detail?.models ?? allModelSummaries.filter((m) => m.provider_id === id);
    const totalTokens =
      detail?.total_tokens ?? models.reduce((s, m) => s + m.total_tokens, 0);
    const totalCost =
      detail?.total_cost ?? models.reduce((s, m) => s + m.total_cost, 0);
    const requestCount =
      detail?.request_count ?? models.reduce((s, m) => s + m.request_count, 0);
    const providerName = detail?.provider_name ?? summary?.provider_name ?? id;

    return {
      name: providerName,
      totalTokens,
      totalCost,
      requestCount,
      models,
      shareOfTotal:
        aggregateTotal && aggregateTotal.total_tokens > 0
          ? (totalTokens / aggregateTotal.total_tokens) * 100
          : 0,
    };
  }, [
    type,
    id,
    providerDetail,
    modelBreakdown,
    allModelSummaries,
    aggregateTotal,
  ]);

  // Model data
  const modelData = useMemo(() => {
    if (type !== "model" || !id) return null;
    const summary = allModelSummaries.find((m) => m.model_id === id);
    if (!summary) return null;

    return {
      name: summary.model_name,
      providerId: summary.provider_id,
      providerName: summary.provider_name,
      totalTokens: summary.total_tokens,
      totalCost: summary.total_cost,
      requestCount: summary.request_count,
      promptTokens: summary.prompt_tokens,
      completionTokens: summary.completion_tokens,
      shareOfTotal:
        aggregateTotal && aggregateTotal.total_tokens > 0
          ? (summary.total_tokens / aggregateTotal.total_tokens) * 100
          : 0,
    };
  }, [type, id, allModelSummaries, aggregateTotal]);

  // Mini line chart data
  const chartData = useMemo(() => {
    if (!dailyTrend || dailyTrend.length === 0) return [];

    if (type === "provider" && providerData) {
      const totalAll = dailyTrend.reduce((s, d) => s + d.total_tokens, 0);
      const ratio = totalAll > 0 ? providerData.totalTokens / totalAll : 0;
      return dailyTrend.map((d) => ({
        date: d.date,
        tokens: Math.round(d.total_tokens * ratio),
      }));
    }

    if (type === "model" && modelData) {
      const totalAll = dailyTrend.reduce((s, d) => s + d.total_tokens, 0);
      const ratio = totalAll > 0 ? modelData.totalTokens / totalAll : 0;
      return dailyTrend.map((d) => ({
        date: d.date,
        tokens: Math.round(d.total_tokens * ratio),
      }));
    }

    return [];
  }, [dailyTrend, type, providerData, modelData]);

  // Title for the sheet
  const title =
    type === "provider"
      ? (providerData?.name ?? "Provider")
      : (modelData?.name ?? "Model");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[540px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-6">
          {/* Provider view */}
          {type === "provider" && providerData && (
            <>
              {/* Share of total */}
              <div className="rounded-lg border p-4 text-center">
                <p className="text-3xl font-bold tabular-nums text-primary">
                  {formatPercentage(providerData.shareOfTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  of total usage across ALL models
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatTokens(providerData.totalTokens)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-sm font-bold tabular-nums">
                    {providerData.totalCost > 0
                      ? formatCost(providerData.totalCost)
                      : "Free"}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-sm font-bold tabular-nums">
                    {providerData.requestCount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Model list */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Models ({providerData.models.length})
                </h3>
                <div className="space-y-1.5">
                  {providerData.models.map((m, idx) => (
                    <div
                      key={m.model_id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                    >
                      <div
                        className="h-4 w-1 shrink-0 rounded-full"
                        style={{
                          backgroundColor: COLORS[idx % COLORS.length],
                        }}
                      />
                      <span className="flex-1 truncate font-medium">
                        {m.model_name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatTokens(m.total_tokens)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini chart */}
              {chartData.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Daily Token Usage
                  </h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart
                      data={chartData}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="detailGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatTokens(v)}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                        width={45}
                      />
                      <Tooltip content={<MiniTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke="#3b82f6"
                        fill="url(#detailGradient)"
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* Model view */}
          {type === "model" && modelData && (
            <>
              {/* Share of total */}
              <div className="rounded-lg border p-4 text-center">
                <p className="text-3xl font-bold tabular-nums text-primary">
                  {formatPercentage(modelData.shareOfTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  of total usage across ALL models
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Tokens</p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatTokens(modelData.totalTokens)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-sm font-bold tabular-nums">
                    {modelData.totalCost > 0
                      ? formatCost(modelData.totalCost)
                      : "Free"}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Prompt</p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatTokens(modelData.promptTokens)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Completion</p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatTokens(modelData.completionTokens)}
                  </p>
                </div>
              </div>

              {/* Provider badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Provider:</span>
                <Badge variant="secondary">{modelData.providerName}</Badge>
              </div>

              {/* Requests */}
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="text-sm font-bold tabular-nums">
                  {modelData.requestCount.toLocaleString()}
                </p>
              </div>

              {/* Mini chart */}
              {chartData.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Daily Token Usage
                  </h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart
                      data={chartData}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="detailModelGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatTokens(v)}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                        width={45}
                      />
                      <Tooltip content={<MiniTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke="#8b5cf6"
                        fill="url(#detailModelGradient)"
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* No data state */}
          {((type === "provider" && !providerData) ||
            (type === "model" && !modelData)) &&
            id && (
              <div className="py-8">
                <LoadingSpinner size="sm" message="Loading details…" />
              </div>
            )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
