import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TrendData {
  direction: "up" | "down" | "flat";
  percentage: number;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: TrendData;
  icon?: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
}

function TrendIndicator({ trend }: { trend: TrendData }): React.JSX.Element {
  if (trend.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" />
        <span>0%</span>
      </span>
    );
  }

  const isUp = trend.direction === "up";
  const Icon = isUp ? ArrowUp : ArrowDown;
  const colorClass = isUp ? "text-emerald-500" : "text-red-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        colorClass,
      )}
    >
      <Icon className="size-3" />
      <span>{trend.percentage > 0 ? trend.percentage.toFixed(1) : "0"}%</span>
    </span>
  );
}

export default function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  onClick,
  loading,
}: MetricCardProps): React.JSX.Element {
  if (loading) {
    return (
      <Card className="gap-3 py-4">
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "gap-3 py-4 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/50",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {value}
          </p>
          {trend && <TrendIndicator trend={trend} />}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
