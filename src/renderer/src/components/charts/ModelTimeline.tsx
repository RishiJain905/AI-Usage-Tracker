import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
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
import { formatTokens, formatCost } from "@/lib/format";
import type {
  DailyTrend,
  Period,
  ModelDailyTrends,
  ModelBreakdown,
} from "@/types/usage";

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

interface ModelTimelineProps {
  data: DailyTrend[];
  modelTrends?: ModelDailyTrends;
  period: Period;
  allModelSummaries: ModelBreakdown[];
}

type ViewMode = "per-model" | "aggregate";
type YAxisMode = "tokens" | "cost";

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  yAxisMode: YAxisMode;
}

function ModelTooltip({
  active,
  payload,
  label,
  yAxisMode,
}: CustomTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;

  const formatter = yAxisMode === "tokens" ? formatTokens : formatCost;

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
          {entry.name}: {formatter(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function ModelTimeline({
  data,
  modelTrends,
  period,
  allModelSummaries: _allModelSummaries,
}: ModelTimelineProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>("per-model");
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("tokens");

  // Determine top 10 models by total usage
  const topModelKeys = useMemo(() => {
    if (!modelTrends) return [];
    const keys = Object.keys(modelTrends);
    if (keys.length <= 10) return keys;

    // Sort by total tokens across all dates, descending
    return keys
      .map((key) => ({
        key,
        total: modelTrends[key].reduce((s, d) => s + d.total_tokens, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((m) => m.key);
  }, [modelTrends]);

  // Build merged per-model dataset
  const perModelData = useMemo(() => {
    if (!modelTrends || topModelKeys.length === 0) return [];

    const dateMap = new Map<string, Record<string, number>>();

    for (const modelKey of topModelKeys) {
      const trends = modelTrends[modelKey];
      for (const entry of trends) {
        if (!dateMap.has(entry.date)) {
          dateMap.set(entry.date, {});
        }
        const record = dateMap.get(entry.date)!;
        const value =
          yAxisMode === "tokens" ? entry.total_tokens : entry.total_cost;
        record[modelKey] = (record[modelKey] ?? 0) + value;
      }
    }

    // Add aggregate dashed line
    for (const values of dateMap.values()) {
      const sum = Object.values(values).reduce((a, b) => a + b, 0);
      values.__aggregate__ = sum;
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [modelTrends, topModelKeys, yAxisMode]);

  // Aggregate-only data
  const aggregateData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d) => ({
      date: d.date,
      aggregate: yAxisMode === "tokens" ? d.total_tokens : d.total_cost,
    }));
  }, [data, yAxisMode]);

  const yFormatter =
    yAxisMode === "tokens"
      ? (v: number) => formatTokens(v)
      : (v: number) => formatCost(v);

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No usage data yet"
            description={`No token usage data available for the selected period (${period}).`}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Model Usage Over Time</CardTitle>
        <div className="flex gap-1">
          {/* View mode toggle */}
          <Button
            variant={viewMode === "per-model" ? "default" : "outline"}
            size="xs"
            onClick={() => setViewMode("per-model")}
          >
            Per-Model
          </Button>
          <Button
            variant={viewMode === "aggregate" ? "default" : "outline"}
            size="xs"
            onClick={() => setViewMode("aggregate")}
          >
            Aggregate Only
          </Button>

          {/* Y-axis mode toggle */}
          <div className="ml-2 h-4 w-px bg-border" />
          <Button
            variant={yAxisMode === "tokens" ? "default" : "outline"}
            size="xs"
            onClick={() => setYAxisMode("tokens")}
          >
            Tokens
          </Button>
          <Button
            variant={yAxisMode === "cost" ? "default" : "outline"}
            size="xs"
            onClick={() => setYAxisMode("cost")}
          >
            Cost
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "aggregate" ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={aggregateData}
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
                tickFormatter={yFormatter}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                width={60}
              />
              <Tooltip content={<ModelTooltip yAxisMode={yAxisMode} />} />
              <Line
                type="monotone"
                dataKey="aggregate"
                name="Total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : !modelTrends || topModelKeys.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <EmptyState
              title="Per-model data not available"
              description="Per-model daily trend data is not available for this view."
            />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={perModelData}
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
                tickFormatter={yFormatter}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                width={60}
              />
              <Tooltip content={<ModelTooltip yAxisMode={yAxisMode} />} />
              <Legend />
              {topModelKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={shortName(key)}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
              {/* Dashed aggregate line */}
              <Line
                type="monotone"
                dataKey="__aggregate__"
                name="Total"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
