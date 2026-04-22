import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost, formatPercentage } from "@/lib/format";
import type { ModelComparisonRow, Period } from "@/types/usage";

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

interface ModelRankingProps {
  models: ModelComparisonRow[];
  period: Period;
  onModelClick?: (modelId: string) => void;
}

interface RankingTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: ModelComparisonRow & { _share: number };
  }>;
  label?: string;
}

function RankingTooltip({
  active,
  payload,
}: RankingTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{entry.model_name}</p>
      <p className="text-xs text-muted-foreground">
        Provider: {entry.provider_name}
      </p>
      <p className="text-xs text-muted-foreground">
        Tokens: {formatTokens(entry.total_tokens)}
      </p>
      <p className="text-xs text-muted-foreground">
        Cost: {formatCost(entry.total_cost)}
      </p>
      <p className="text-xs text-muted-foreground">
        Share: {formatPercentage(entry._share)}
      </p>
      {entry.input_price_per_million > 0 && (
        <p className="text-xs text-muted-foreground">
          Input: ${entry.input_price_per_million}/M · Output: $
          {entry.output_price_per_million}/M
        </p>
      )}
    </div>
  );
}

/** Derive a short display name from a model ID or name */
function shortModelName(name: string): string {
  const parts = name.split(/[/.]/);
  return parts[parts.length - 1] || name;
}

export default function ModelRanking({
  models,
  period: _period,
  onModelClick,
}: ModelRankingProps): React.JSX.Element {
  const chartData = useMemo(() => {
    // Sort by total_tokens descending
    const sorted = [...models]
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .slice(0, 20); // Cap at top 20 for readability

    const maxTokens = sorted.length > 0 ? sorted[0].total_tokens : 1;
    const grandTotal = models.reduce((s, m) => s + m.total_tokens, 0);

    return sorted.map((m) => ({
      ...m,
      _shortName: shortModelName(m.model_name),
      _share: grandTotal > 0 ? (m.total_tokens / grandTotal) * 100 : 0,
      _pctOfMax: maxTokens > 0 ? (m.total_tokens / maxTokens) * 100 : 0,
    }));
  }, [models]);

  // Build stable provider → color index map
  const providerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueProviders = [...new Set(models.map((m) => m.provider_id))].sort();
    uniqueProviders.forEach((pid, idx) => {
      map.set(pid, COLORS[idx % COLORS.length]);
    });
    return map;
  }, [models]);

  if (!models || models.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No model data"
            description="No model usage data available for the selected period."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Ranking</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, chartData.length * 40)}
        >
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
              horizontal={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatTokens(v)}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="_shortName"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              width={120}
            />
            <Tooltip content={<RankingTooltip />} />
            <Bar
              dataKey="total_tokens"
              name="Tokens"
              radius={[0, 4, 4, 0]}
              cursor={onModelClick ? "pointer" : "default"}
              onClick={(entry: { payload?: { model_id?: string } }) => {
                if (onModelClick && entry.payload?.model_id) {
                  onModelClick(entry.payload.model_id);
                }
              }}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.model_id}
                  fill={providerColorMap.get(entry.provider_id) ?? "#8884d8"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Labels list below chart */}
        <div className="mt-3 space-y-1">
          {chartData.map((entry) => (
            <button
              key={entry.model_id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent/50 disabled:pointer-events-none"
              disabled={!onModelClick}
              onClick={() => onModelClick?.(entry.model_id)}
            >
              <span className="truncate font-medium">{entry.model_name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {formatTokens(entry.total_tokens)} ·{" "}
                {formatCost(entry.total_cost)} ·{" "}
                {formatPercentage(entry._share)}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
