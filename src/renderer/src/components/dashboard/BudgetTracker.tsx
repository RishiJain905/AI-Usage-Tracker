import { useSettingsStore } from "@/stores/settingsStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCost, formatPercentage } from "@/lib/format";
import {
  calculateProjection,
  getBudgetStatus,
  getDaysElapsedInMonth,
  getDaysInMonth,
} from "@/lib/projection";

interface BudgetTrackerProps {
  currentSpend: number;
}

export default function BudgetTracker({
  currentSpend,
}: BudgetTrackerProps): React.JSX.Element | null {
  const monthlyBudget = useSettingsStore(
    (s) => s.settings.budget.monthlyBudget,
  );

  if (monthlyBudget <= 0) return null;

  const percentage = Math.min((currentSpend / monthlyBudget) * 100, 100);
  const rawPercentage = (currentSpend / monthlyBudget) * 100;

  const projected = calculateProjection(
    currentSpend,
    getDaysElapsedInMonth(),
    getDaysInMonth(),
  );
  const budgetStatus = getBudgetStatus(projected, monthlyBudget);

  let indicatorColor = "bg-emerald-500";
  if (rawPercentage > 80) {
    indicatorColor = "bg-red-500";
  } else if (rawPercentage >= 50) {
    indicatorColor = "bg-yellow-500";
  }

  let statusText: string;
  let statusColor: string;
  if (budgetStatus === "over") {
    statusText = "Over budget";
    statusColor = "text-red-600 dark:text-red-400";
  } else if (budgetStatus === "under") {
    statusText = "Under budget";
    statusColor = "text-emerald-600 dark:text-emerald-400";
  } else {
    statusText = "On track";
    statusColor = "text-amber-700 dark:text-amber-400";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget &amp; Spending</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Monthly Budget: {formatCost(monthlyBudget)}
        </div>

        <div className={indicatorColor}>
          <Progress value={percentage} />
        </div>

        <div className="text-sm">
          {formatCost(currentSpend)} / {formatCost(monthlyBudget)} (
          {formatPercentage(Math.round(rawPercentage * 10) / 10)})
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            Projected: {formatCost(projected)}
          </div>
          <div className={`text-sm font-medium ${statusColor}`}>
            {statusText}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
