import type { DailyTrend, Period } from "@/types/usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCost } from "@/lib/format";
import { getDaysElapsedInMonth, getDaysInMonth } from "@/lib/projection";

interface CostProjectionProps {
  dailyTrend: DailyTrend[];
  period: Period;
}

export default function CostProjection({
  dailyTrend,
  period,
}: CostProjectionProps): React.JSX.Element {
  if (period !== "month") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Switch to monthly view for projection
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeDays = dailyTrend.filter((d) => d.total_cost > 0);
  const avgDailyCost =
    activeDays.length > 0
      ? activeDays.reduce((sum, d) => sum + d.total_cost, 0) / activeDays.length
      : 0;

  const remainingDays = getDaysInMonth() - getDaysElapsedInMonth();
  const monthToDateSpend = dailyTrend.reduce((sum, d) => sum + d.total_cost, 0);
  const projectedTotal = monthToDateSpend + avgDailyCost * remainingDays;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Projection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">
          If current pace continues:{" "}
          <span className="font-medium">{formatCost(projectedTotal)}</span> by
          end of month
        </p>
        <p className="text-xs italic text-muted-foreground">
          Projection based on current usage pattern
        </p>
      </CardContent>
    </Card>
  );
}
