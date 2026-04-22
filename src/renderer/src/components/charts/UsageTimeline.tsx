import { useState, useCallback, useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens } from "@/lib/format";
import type { DailyTrend, Period, ModelDailyTrends } from "@/types/usage";

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

interface UsageTimelineProps {
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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

function AggregateTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps): React.JSX.Element | null {
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

export default function UsageTimeline({
  data,
  modelTrends,
  period,
}: UsageTimelineProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>("aggregate");

  const handleToggle = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token Usage Over Time</CardTitle>
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
      <CardHeader className="flex flex-row flex-wrap items-center justify-between space-y-0">
        <CardTitle>Token Usage Over Time</CardTitle>
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
          <AggregateChart data={data} />
        ) : (
          <PerModelChart modelTrends={modelTrends} />
        )}
      </CardContent>
    </Card>
  );
}

function AggregateChart({ data }: { data: DailyTrend[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
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
          width={60}
        />
        <Tooltip content={<AggregateTooltip />} />
        <Area
          type="monotone"
          dataKey="total_tokens"
          name="Total Tokens"
          stroke="#3b82f6"
          fill="url(#tokenGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PerModelChart({
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

  // Merge per-model trends into a single dataset keyed by date
  const modelKeys = Object.keys(modelTrends);
  const mergedData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();

    for (const modelKey of modelKeys) {
      const trends = modelTrends[modelKey];
      for (const entry of trends) {
        if (!dateMap.has(entry.date)) {
          dateMap.set(entry.date, {});
        }
        const record = dateMap.get(entry.date)!;
        record[modelKey] = (record[modelKey] ?? 0) + entry.total_tokens;
      }
    }

    // Sort by date
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [modelTrends]);

  // Derive a short model name from the key (use last segment after / or .)
  function shortName(key: string): string {
    const parts = key.split(/[/.]/);
    return parts[parts.length - 1] || key;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
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
          tickFormatter={(v: number) => formatTokens(v)}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={60}
        />
        <Tooltip content={<AggregateTooltip />} />
        <Legend />
        {modelKeys.map((key, index) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={shortName(key)}
            stackId="1"
            stroke={COLORS[index % COLORS.length]}
            fill={COLORS[index % COLORS.length]}
            fillOpacity={0.6}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
