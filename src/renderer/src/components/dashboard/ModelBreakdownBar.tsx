import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost, formatPercentage } from "@/lib/format";
import type { ModelBreakdown, Period } from "@/types/usage";

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

interface ModelBreakdownBarProps {
  models: ModelBreakdown[];
  period: Period;
}

export default function ModelBreakdownBar({
  models,
  period: _period,
}: ModelBreakdownBarProps): React.JSX.Element {
  const navigate = useNavigate();

  if (!models || models.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Per-Model Breakdown</CardTitle>
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

  const totalTokens = models.reduce((sum, m) => sum + m.total_tokens, 0);
  const totalCost = models.reduce((sum, m) => sum + m.total_cost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Model Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {models.map((model, index) => {
          const percentage =
            totalTokens > 0 ? (model.total_tokens / totalTokens) * 100 : 0;
          const color = COLORS[index % COLORS.length];

          return (
            <button
              key={model.model_id}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/50"
              onClick={() =>
                navigate(
                  `/models?modelId=${encodeURIComponent(model.model_id)}`,
                )
              }
            >
              {/* Color bar indicator */}
              <div
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />

              {/* Model info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {model.model_name}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {model.provider_name}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatTokens(model.total_tokens)} tokens ·{" "}
                  {model.total_cost > 0 ? formatCost(model.total_cost) : "Free"}
                </div>
              </div>

              {/* Percentage */}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {formatPercentage(percentage)}
              </span>
            </button>
          );
        })}

        {/* Total row */}
        <div className="flex items-center gap-3 border-t px-3 pt-2 mt-2">
          <div className="h-8 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold">TOTAL</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTokens(totalTokens)} tokens ·{" "}
            {totalCost > 0 ? formatCost(totalCost) : "Free"}
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            100%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
