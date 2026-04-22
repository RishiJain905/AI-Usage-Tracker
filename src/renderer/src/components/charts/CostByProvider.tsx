import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCost } from "@/lib/format";
import { FALLBACK_COLORS, PROVIDER_COLORS } from "@/lib/providerColors";
import type { ProviderSummary } from "@/types/usage";

interface CostByProviderProps {
  data: ProviderSummary[];
}

/** Resolve segment color from provider_id */
function resolveColor(providerId: string, index: number): string {
  return (
    PROVIDER_COLORS[providerId] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { provider_id: string; provider_name: string; total_cost: number };
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
        Cost: {formatCost(entry.value)}
      </p>
    </div>
  );
}

export default function CostByProvider({
  data,
}: CostByProviderProps): React.JSX.Element {
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(
    new Set(),
  );

  // Filter out hidden providers
  const visibleData = useMemo(
    () => data.filter((d) => !hiddenProviders.has(d.provider_id)),
    [data, hiddenProviders],
  );

  // Total cost from ALL providers (including hidden)
  const totalCost = useMemo(
    () => data.reduce((sum, d) => sum + d.total_cost, 0),
    [data],
  );

  // Toggle a provider's visibility
  const handleLegendClick = (providerId: string): void => {
    setHiddenProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No cost data yet"
            description="No provider cost data available for the selected period."
          />
        </CardContent>
      </Card>
    );
  }

  if (visibleData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost by Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <EmptyState
            title="All providers hidden"
            description="Re-enable at least one provider to view the chart."
          />
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHiddenProviders(new Set())}
            >
              Reset hidden providers
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Provider</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={visibleData}
                dataKey="total_cost"
                nameKey="provider_name"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                cx="50%"
                cy="50%"
                isAnimationActive
              >
                {visibleData.map((entry, index) => (
                  <Cell
                    key={entry.provider_id}
                    fill={resolveColor(entry.provider_id, index)}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                onClick={(entry) => {
                  // Find the provider_id for this legend entry
                  const match = data.find(
                    (d) => d.provider_name === entry.value,
                  );
                  if (match) handleLegendClick(match.provider_id);
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center overlay: total cost */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold">{formatCost(totalCost)}</p>
              <p className="text-xs text-muted-foreground">total cost</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
