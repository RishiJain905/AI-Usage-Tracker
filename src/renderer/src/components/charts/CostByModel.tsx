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
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCost, formatPercentage } from "@/lib/format";
import type { ModelBreakdown, Period } from "@/types/usage";

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

interface CostByModelProps {
  models: ModelBreakdown[];
  period: Period;
}

/** Resolve segment color from provider_id */
function resolveColor(providerId: string, index: number): string {
  return (
    PROVIDER_COLORS[providerId] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

/** Derive a short display name from a model ID or name */
function shortModelName(name: string): string {
  const parts = name.split(/[/.]/);
  return parts[parts.length - 1] || name;
}

interface ChartRow {
  model_id: string;
  model_name: string;
  short_name: string;
  provider_id: string;
  provider_name: string;
  total_cost: number;
  share: number;
  isOther?: boolean;
}

interface ModelTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: ChartRow;
  }>;
}

function ModelTooltip({
  active,
  payload,
}: ModelTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{entry.model_name}</p>
      <p className="text-xs text-muted-foreground">
        Provider: {entry.provider_name}
      </p>
      <p className="text-xs text-muted-foreground">
        Cost: {formatCost(entry.total_cost)}
      </p>
      <p className="text-xs text-muted-foreground">
        Share: {formatPercentage(entry.share)}
      </p>
    </div>
  );
}

export default function CostByModel({
  models,
  period: _period,
}: CostByModelProps): React.JSX.Element {
  const { chartData, aggregateTotal } = useMemo(() => {
    if (!models || models.length === 0) {
      return { chartData: [] as ChartRow[], aggregateTotal: 0 };
    }

    const total = models.reduce((sum, m) => sum + m.total_cost, 0);

    // Sort by total_cost descending
    const sorted = [...models].sort((a, b) => b.total_cost - a.total_cost);

    let rows: ChartRow[];

    if (sorted.length > 10) {
      // Take top 10, group the rest as "Other"
      const top10 = sorted.slice(0, 10);
      const others = sorted.slice(10);

      const otherCost = others.reduce((sum, m) => sum + m.total_cost, 0);

      rows = [
        ...top10.map((m) => ({
          model_id: m.model_id,
          model_name: m.model_name,
          short_name: shortModelName(m.model_name),
          provider_id: m.provider_id,
          provider_name: m.provider_name,
          total_cost: m.total_cost,
          share: total > 0 ? (m.total_cost / total) * 100 : 0,
        })),
        {
          model_id: "__other__",
          model_name: "Other",
          short_name: "Other",
          provider_id: "",
          provider_name: "Other",
          total_cost: otherCost,
          share: total > 0 ? (otherCost / total) * 100 : 0,
          isOther: true,
        },
      ];
    } else {
      rows = sorted.map((m) => ({
        model_id: m.model_id,
        model_name: m.model_name,
        short_name: shortModelName(m.model_name),
        provider_id: m.provider_id,
        provider_name: m.provider_name,
        total_cost: m.total_cost,
        share: total > 0 ? (m.total_cost / total) * 100 : 0,
      }));
    }

    return { chartData: rows, aggregateTotal: total };
  }, [models]);

  if (!models || models.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost by Model (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No model cost data"
            description="No model cost data available for the selected period."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Model (Top 10)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, chartData.length * 40)}
        >
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
              horizontal={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatCost(v)}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="short_name"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              width={120}
            />
            <Tooltip content={<ModelTooltip />} />
            <Bar dataKey="total_cost" name="Cost" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.model_id}
                  fill={
                    entry.isOther
                      ? "#94a3b8"
                      : resolveColor(entry.provider_id, index)
                  }
                />
              ))}
              <LabelList
                dataKey="total_cost"
                position="right"
                formatter={(value) => formatCost(Number(value ?? 0))}
                style={{ fontSize: 11, fill: "currentColor" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Aggregate total */}
        <div className="mt-4 border-t pt-3 text-center">
          <span className="text-sm font-semibold">
            TOTAL: {formatCost(aggregateTotal)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
