import { useState, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCost } from "@/lib/format";
import type { DailyTrend, Period, ModelDailyTrends } from "@/types/usage";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a574",
  ollama: "#6366f1",
  glm: "#3b82f6",
  minimax: "#f59e0b",
  gemini: "#8b5cf6",
  mistral: "#ef4444",
  groq: "#06b6d4",
};
const FALLBACK_COLORS = [
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

interface CostTimelineProps {
  data: DailyTrend[];
  modelTrends?: ModelDailyTrends;
  period: Period;
}

type ViewMode = "aggregate" | "per-model";

/** Format a date string like "2026-04-19" to short "Apr 19" */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Derive a short display name from a model key */
function shortName(key: string): string {
  const parts = key.split(/[/.]/);
  return parts[parts.length - 1] || key;
}

/** Extract a provider prefix from a model key (e.g. "openai/gpt-4" → "openai") */
function extractProvider(key: string): string {
  const parts = key.split("/");
  return parts.length > 1 ? parts[0] : "";
}

interface CostTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

function CostTooltip({
  active,
  payload,
  label,
}: CostTooltipProps): React.JSX.Element | null {
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
          {entry.name}: {formatCost(entry.value)}
        </p>
      ))}
    </div>
  );
}

/** Derive approximate input_cost and output_cost from DailyTrend using token ratios */
function deriveCostData(data: DailyTrend[]): Array<{
  date: string;
  input_cost: number;
  output_cost: number;
  total_cost: number;
}> {
  return data.map((entry) => {
    const promptRatio =
      entry.total_tokens > 0 ? entry.prompt_tokens / entry.total_tokens : 0.5;
    const completionRatio = 1 - promptRatio;
    return {
      date: entry.date,
      input_cost: entry.total_cost * promptRatio,
      output_cost: entry.total_cost * completionRatio,
      total_cost: entry.total_cost,
    };
  });
}

export default function CostTimeline({
  data,
  modelTrends,
  period,
}: CostTimelineProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>("aggregate");

  const handleToggle = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No cost data yet"
            description={`No cost data available for the selected period (${period}).`}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Cost Over Time</CardTitle>
        <div className="flex gap-1">
          <Button
            variant={viewMode === "aggregate" ? "default" : "outline"}
            size="xs"
            onClick={() => handleToggle("aggregate")}
          >
            Aggregate
          </Button>
          <Button
            variant={viewMode === "per-model" ? "default" : "outline"}
            size="xs"
            onClick={() => handleToggle("per-model")}
          >
            Per-Model Stacked
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "aggregate" ? (
          <AggregateCostChart data={data} />
        ) : (
          <PerModelCostChart modelTrends={modelTrends} />
        )}
      </CardContent>
    </Card>
  );
}

function AggregateCostChart({
  data,
}: {
  data: DailyTrend[];
}): React.JSX.Element {
  const chartData = deriveCostData(data);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart
        data={chartData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="inputCostGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="outputCostGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
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
          tickFormatter={(v: number) => formatCost(v)}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={60}
        />
        <Tooltip content={<CostTooltip />} />
        <Legend />
        <Area
          type="monotone"
          dataKey="input_cost"
          name="Input Cost"
          stackId="cost"
          stroke="#3b82f6"
          fill="url(#inputCostGradient)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="output_cost"
          name="Output Cost"
          stackId="cost"
          stroke="#10b981"
          fill="url(#outputCostGradient)"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="total_cost"
          name="Total Cost"
          stroke="#94a3b8"
          strokeDasharray="6 3"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PerModelCostChart({
  modelTrends,
}: {
  modelTrends?: ModelDailyTrends;
}): React.JSX.Element {
  if (!modelTrends || Object.keys(modelTrends).length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <EmptyState
          title="Per-model data not available"
          description="Per-model daily trend data is not available for this view."
        />
      </div>
    );
  }

  const modelKeys = Object.keys(modelTrends);

  // Merge per-model trends into a single dataset keyed by date
  const dateMap = new Map<string, Record<string, number>>();

  for (const modelKey of modelKeys) {
    const trends = modelTrends[modelKey];
    for (const entry of trends) {
      if (!dateMap.has(entry.date)) {
        dateMap.set(entry.date, {});
      }
      const record = dateMap.get(entry.date)!;
      record[modelKey] = (record[modelKey] ?? 0) + entry.total_cost;
    }
  }

  // Sort by date
  const mergedData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  /** Resolve color for a model key using its provider prefix */
  function resolveColor(key: string, index: number): string {
    const provider = extractProvider(key);
    if (provider && PROVIDER_COLORS[provider]) {
      return PROVIDER_COLORS[provider];
    }
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart
        data={mergedData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          tickFormatter={(v: number) => formatCost(v)}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={60}
        />
        <Tooltip content={<CostTooltip />} />
        <Legend />
        {modelKeys.map((key, index) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={shortName(key)}
            stackId="1"
            stroke={resolveColor(key, index)}
            fill={resolveColor(key, index)}
            fillOpacity={0.6}
            strokeWidth={1.5}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
