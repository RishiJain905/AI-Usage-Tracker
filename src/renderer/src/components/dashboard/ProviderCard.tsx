import { Card } from "@/components/ui/card";
import { formatTokens, formatCost } from "@/lib/format";
import type { Period } from "@/types/usage";
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

interface ProviderCardProps {
  provider: ProviderAggregate;
  period: Period;
  totalTokens?: number;
  onClick?: () => void;
}

function getProviderColor(providerId: string, index: number): string {
  // Use a hash of the provider_id for stable color, fall back to index
  let hash = 0;
  for (let i = 0; i < providerId.length; i++) {
    hash = (hash * 31 + providerId.charCodeAt(i)) | 0;
  }
  return (
    COLORS[Math.abs(hash) % COLORS.length] ?? COLORS[index % COLORS.length]
  );
}

export default function ProviderCard({
  provider,
  period: _period,
  totalTokens,
  onClick,
}: ProviderCardProps): React.JSX.Element {
  const percentage =
    totalTokens && totalTokens > 0
      ? (provider.total_tokens / totalTokens) * 100
      : 0;

  const initial = provider.provider_name.charAt(0).toUpperCase();
  const color = getProviderColor(provider.provider_id, 0);

  return (
    <Card
      className="gap-3 py-4 transition-colors cursor-pointer hover:bg-accent/50"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="px-4 space-y-3">
        {/* Header: avatar + name + status */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">
                {provider.provider_name}
              </span>
              <span
                className={`inline-block size-2 shrink-0 rounded-full ${
                  provider.isActive ? "bg-emerald-500" : "bg-gray-400"
                }`}
                title={provider.isActive ? "Active" : "Inactive"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {provider.model_count} model
              {provider.model_count !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Tokens</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatTokens(provider.total_tokens)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="text-sm font-semibold tabular-nums">
              {provider.total_cost > 0
                ? formatCost(provider.total_cost)
                : "Free"}
            </p>
          </div>
        </div>

        {/* Usage proportion bar */}
        {totalTokens && totalTokens > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">
              {percentage.toFixed(1)}% of total
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
