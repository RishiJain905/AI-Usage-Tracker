import { useNavigate } from "react-router-dom";
import { Activity, Sun, Moon, Settings } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUsageStore } from "@/stores/usageStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getEffectiveTheme } from "@/lib/theme";
import type { Period } from "@/types/usage";

function formatTokenCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

function ThemeIcon({
  theme,
}: {
  theme: "light" | "dark" | "system";
}): React.JSX.Element {
  const effective = getEffectiveTheme(theme);
  if (effective === "dark") return <Moon className="size-4" />;
  return <Sun className="size-4" />;
}

export default function Header(): React.JSX.Element {
  const navigate = useNavigate();

  // Usage store
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const proxyStatus = useUsageStore((s) => s.proxyStatus);
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const topModels = useUsageStore((s) => s.topModels);

  // Settings store
  const theme = useSettingsStore((s) => s.settings.display.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  const isProxyRunning = proxyStatus?.isRunning ?? false;
  const proxyPort = proxyStatus?.port;
  const totalTokens = aggregateTotal?.total_tokens ?? 0;
  const totalCost = aggregateTotal?.total_cost ?? 0;
  const topModel = topModels.length > 0 ? topModels[0] : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      {/* Sidebar trigger */}
      <SidebarTrigger />
      <Separator orientation="vertical" className="!h-6" />

      {/* App name */}
      <div className="flex items-center gap-1.5 font-semibold text-sm">
        <Activity className="size-4 text-primary" />
        <span>AI Usage Tracker</span>
      </div>

      {/* Proxy status indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isProxyRunning ? "secondary" : "outline"}
            className="flex items-center gap-1.5 cursor-default"
          >
            <span
              className={`inline-block size-2 rounded-full ${
                isProxyRunning ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs">
              {isProxyRunning ? `Running :${proxyPort ?? ""}` : "Stopped"}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {isProxyRunning
            ? `Proxy is running on port ${proxyPort}`
            : "Proxy is not running"}
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="!h-6" />

      {/* Quick stats */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default tabular-nums">
              {formatTokenCount(totalTokens)} tokens
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {totalTokens.toLocaleString()} total tokens for this period
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default tabular-nums font-medium text-foreground">
              {formatCost(totalCost)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Total cost for this period:{" "}
            {totalCost.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}
          </TooltipContent>
        </Tooltip>

        {topModel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default hidden sm:inline">
                Top: {topModel.model_name}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Most used model: {topModel.model_name} (
              {formatTokenCount(topModel.total_tokens)} tokens)
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Period pill tabs */}
      <Tabs
        value={period}
        onValueChange={(value) => setPeriod(value as Period)}
      >
        <TabsList className="h-8">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <TabsTrigger key={p} value={p} className="px-3 text-xs h-6">
              {PERIOD_LABELS[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Separator orientation="vertical" className="!h-6" />

      {/* Theme toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={`Current theme: ${theme}. Click to cycle.`}
          >
            <ThemeIcon theme={theme} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
        </TooltipContent>
      </Tooltip>

      {/* Settings link */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/settings")}
            aria-label="Settings"
          >
            <Settings className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
    </header>
  );
}
