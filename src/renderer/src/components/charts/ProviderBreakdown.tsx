import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost } from "@/lib/format";
import type { ProviderSummary } from "@/types/usage";

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#f97316",
];

interface ProviderBreakdownProps {
  type: "tokens" | "cost";
  data: ProviderSummary[];
}

// Build a stable color map keyed by provider_id
function getColorMap(data: ProviderSummary[]): Map<string, string> {
  const map = new Map<string, string>();
  data.forEach((item, index) => {
    map.set(item.provider_id, COLORS[index % COLORS.length]);
  });
  return map;
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { provider_id: string; provider_name: string };
  }>;
}

function PieTooltip({
  active,
  payload,
}: PieTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{entry.payload.provider_name}</p>
      <p className="text-xs text-muted-foreground">
        Tokens: {formatTokens(entry.value)}
      </p>
    </div>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: { provider_id: string; provider_name: string; total_cost: number };
  }>;
  label?: string;
}

function BarTooltip({
  active,
  payload,
}: BarTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{entry.payload.provider_name}</p>
      <p className="text-xs text-muted-foreground">
        Cost: {formatCost(entry.value)}
      </p>
    </div>
  );
}

export default function ProviderBreakdown({
  type,
  data,
}: ProviderBreakdownProps): React.JSX.Element {
  const navigate = useNavigate();
  const colorMap = useMemo(() => getColorMap(data), [data]);

  const handleClick = useCallback(
    (providerId: string) => {
      navigate(`/providers?providerId=${encodeURIComponent(providerId)}`);
    },
    [navigate],
  );

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {type === "tokens"
              ? "Token Distribution by Provider"
              : "Cost Distribution by Provider"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No provider data yet"
            description="No provider breakdown data available for the selected period."
          />
        </CardContent>
      </Card>
    );
  }

  if (type === "tokens") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token Distribution by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <TokensDonut data={data} colorMap={colorMap} onClick={handleClick} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Distribution by Provider</CardTitle>
      </CardHeader>
      <CardContent>
        <CostBars data={data} colorMap={colorMap} onClick={handleClick} />
      </CardContent>
    </Card>
  );
}

function TokensDonut({
  data,
  colorMap,
  onClick,
}: {
  data: ProviderSummary[];
  colorMap: Map<string, string>;
  onClick: (providerId: string) => void;
}): React.JSX.Element {
  const totalTokens = data.reduce((sum, d) => sum + d.total_tokens, 0);

  // Build a lookup from provider_name to provider_id for click handling
  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data) {
      map.set(item.provider_name, item.provider_id);
    }
    return map;
  }, [data]);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total_tokens"
            nameKey="provider_name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            cx="50%"
            cy="50%"
            onClick={(entry) => {
              const id = nameToId.get(entry.name as string) ?? entry.name;
              onClick(id as string);
            }}
            style={{ cursor: "pointer" }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.provider_id}
                fill={colorMap.get(entry.provider_id) ?? "#8884d8"}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label rendered as overlay */}
      <CenterLabelOverlay totalTokens={totalTokens} />
    </div>
  );
}

/**
 * Overlay-based center label for the donut chart.
 * Uses absolute positioning in the center of the 300px tall container.
 */
function CenterLabelOverlay({
  totalTokens,
}: {
  totalTokens: number;
}): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold">{formatTokens(totalTokens)}</p>
        <p className="text-xs text-muted-foreground">total tokens</p>
      </div>
    </div>
  );
}

function CostBars({
  data,
  colorMap,
  onClick,
}: {
  data: ProviderSummary[];
  colorMap: Map<string, string>;
  onClick: (providerId: string) => void;
}): React.JSX.Element {
  // Sort by total_cost descending
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.total_cost - a.total_cost),
    [data],
  );

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(150, sorted.length * 48)}
    >
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
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
          dataKey="provider_name"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={100}
        />
        <Tooltip content={<BarTooltip />} />
        <Bar
          dataKey="total_cost"
          radius={[0, 4, 4, 0]}
          cursor="pointer"
          onClick={(entry) => {
            // Use originalDataIndex to look up from sorted data
            const idx = entry.originalDataIndex;
            const providerId = sorted[idx]?.provider_id;
            if (providerId) onClick(providerId);
          }}
        >
          {sorted.map((entry) => (
            <Cell
              key={entry.provider_id}
              fill={colorMap.get(entry.provider_id) ?? "#8884d8"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
