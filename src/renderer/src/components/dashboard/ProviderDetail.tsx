import { useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost, formatPercentage } from "@/lib/format";
import { useUsageStore } from "@/stores/usageStore";
import type { Period, DailyTrend } from "@/types/usage";
import type { ProviderAggregate } from "@/hooks/useProviderData";

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

interface ProviderDetailProps {
  provider: ProviderAggregate;
  period: Period;
  onClose: () => void;
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

export default function ProviderDetailPanel({
  provider,
  period,
  onClose,
}: ProviderDetailProps): React.JSX.Element {
  const providerDetail = useUsageStore((s) => s.providerDetail);
  const fetchProviderDetail = useUsageStore((s) => s.fetchProviderDetail);
  const dailyTrend = useUsageStore((s) => s.dailyTrend);

  const detail = providerDetail[provider.provider_id];

  useEffect(() => {
    fetchProviderDetail(provider.provider_id);
  }, [provider.provider_id, fetchProviderDetail]);

  // Filter daily trend to just this provider's contribution
  // Since dailyTrend is aggregate, we'll use the provider's proportional share
  // as an approximation (detail data is per-model under this provider)
  const providerTrend: DailyTrend[] = useMemo(() => {
    if (!dailyTrend || dailyTrend.length === 0) return [];
    // Use the detail's models to compute provider's daily contribution
    // For now, use aggregate daily trend scaled by provider share
    const totalAllTokens = dailyTrend.reduce((s, d) => s + d.total_tokens, 0);
    const providerRatio =
      totalAllTokens > 0 ? provider.total_tokens / totalAllTokens : 0;
    return dailyTrend.map((d) => ({
      ...d,
      total_tokens: Math.round(d.total_tokens * providerRatio),
      total_cost: d.total_cost * providerRatio,
      prompt_tokens: Math.round(d.prompt_tokens * providerRatio),
      completion_tokens: Math.round(d.completion_tokens * providerRatio),
      request_count: Math.round(d.request_count * providerRatio),
    }));
  }, [dailyTrend, provider.total_tokens]);

  const models = detail?.models ?? provider.models ?? [];

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <CardTitle>{provider.provider_name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Provider detail · {period}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Tokens</p>
            <p className="text-lg font-bold tabular-nums">
              {formatTokens(provider.total_tokens)}
            </p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-lg font-bold tabular-nums">
              {provider.total_cost > 0
                ? formatCost(provider.total_cost)
                : "Free"}
            </p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Requests</p>
            <p className="text-lg font-bold tabular-nums">
              {provider.request_count.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Average latency and error rate */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Avg. Latency</p>
            <p className="text-sm font-semibold">
              {detail?.avgLatencyMs != null && detail.avgLatencyMs > 0
                ? `${detail.avgLatencyMs.toFixed(0)}ms`
                : "N/A"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Error Rate</p>
            <p className="text-sm font-semibold">
              {detail?.errorRate != null && detail.errorRate > 0
                ? formatPercentage(detail.errorRate)
                : "N/A"}
            </p>
          </div>
        </div>

        {/* Per-model breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-semibold">Models</h3>
          {models.length === 0 ? (
            <EmptyState
              title="No models"
              description="No model data available for this provider."
            />
          ) : (
            <div className="space-y-2">
              {models.map((model, index) => {
                const pct =
                  provider.total_tokens > 0
                    ? (model.total_tokens / provider.total_tokens) * 100
                    : 0;
                const color = COLORS[index % COLORS.length];

                return (
                  <div
                    key={model.model_id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent/50"
                  >
                    <div
                      className="h-6 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {model.model_name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatTokens(model.total_tokens)} tokens ·{" "}
                        {model.total_cost > 0
                          ? formatCost(model.total_cost)
                          : "Free"}
                      </div>
                      <Progress value={pct} className="mt-1 h-1" />
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                      {formatPercentage(pct)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Usage timeline */}
        <div>
          <h3 className="mb-3 text-sm font-semibold">Usage Timeline</h3>
          {providerTrend.length === 0 ? (
            <EmptyState
              title="No trend data"
              description="No daily usage data available for this provider."
            />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={providerTrend}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <defs>
                  <linearGradient
                    id="providerGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                  width={50}
                />
                <Tooltip content={<MiniTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total_tokens"
                  name="Tokens"
                  stroke="#3b82f6"
                  fill="url(#providerGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
