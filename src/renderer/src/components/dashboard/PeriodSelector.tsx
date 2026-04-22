import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Period } from "@/types/usage";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

interface PeriodSelectorProps {
  period: Period;
  onChange: (period: Period) => void;
}

export default function PeriodSelector({
  period,
  onChange,
}: PeriodSelectorProps): React.JSX.Element {
  return (
    <Tabs value={period} onValueChange={(value) => onChange(value as Period)}>
      <TabsList className="h-8">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <TabsTrigger key={p} value={p} className="px-3 text-xs h-6">
            {PERIOD_LABELS[p]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
