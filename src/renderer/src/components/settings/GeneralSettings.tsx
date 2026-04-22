import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import {
  BUDGET_ALERT_MAX,
  BUDGET_ALERT_MIN,
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  PROXY_PORT_MAX,
  PROXY_PORT_MIN,
  RETENTION_OPTIONS,
  isValidBudgetAmount,
  isValidProxyPort,
} from "@/types/settings";
import type {
  DateFormat,
  NumberFormat,
  RetentionPeriodDays,
  Theme,
} from "@/types/settings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUsageStore } from "@/stores/usageStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FeedbackTone = "success" | "error" | "info";

interface FeedbackMessage {
  tone: FeedbackTone;
  message: string;
}

const themeOptions: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function formatClearDataResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return "Clear data completed.";
  }

  const counts = Object.entries(result as Record<string, unknown>).filter(
    ([, value]) => typeof value === "number",
  );

  if (counts.length === 0) {
    return "Clear data completed.";
  }

  return `Clear data completed: ${counts
    .map(([key, value]) => `${key}=${value}`)
    .join(", ")}.`;
}

function ProxyPortControl({
  port,
  onSave,
}: {
  port: number;
  onSave: (port: number) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(String(port));
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    const parsed = Number(value);
    if (!isValidProxyPort(parsed)) {
      setError(
        `Port must be an integer between ${PROXY_PORT_MIN} and ${PROXY_PORT_MAX}.`,
      );
      return;
    }

    setError(null);
    setValue(String(parsed));
    onSave(parsed);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="proxy-port">Port</Label>
      <Input
        id="proxy-port"
        type="number"
        min={PROXY_PORT_MIN}
        max={PROXY_PORT_MAX}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          }
        }}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MonthlyBudgetControl({
  budget,
  onSave,
}: {
  budget: number;
  onSave: (budget: number) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(String(budget));
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    const parsed = Number(value);
    if (!isValidBudgetAmount(parsed)) {
      setError("Budget must be a non-negative number.");
      return;
    }

    setError(null);
    setValue(String(parsed));
    onSave(parsed);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="monthly-budget">Monthly Budget</Label>
      <Input
        id="monthly-budget"
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          }
        }}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Set to 0 to disable budget tracking widgets.
      </p>
    </div>
  );
}

export default function GeneralSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const storeError = useSettingsStore((s) => s.error);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const setProxyPort = useSettingsStore((s) => s.setProxyPort);
  const setProxyAutoStart = useSettingsStore((s) => s.setProxyAutoStart);
  const toggleProxy = useSettingsStore((s) => s.toggleProxy);
  const setNumberFormat = useSettingsStore((s) => s.setNumberFormat);
  const setDateFormat = useSettingsStore((s) => s.setDateFormat);
  const setMonthlyBudget = useSettingsStore((s) => s.setMonthlyBudget);
  const setBudgetAlertThreshold = useSettingsStore(
    (s) => s.setBudgetAlertThreshold,
  );
  const setBudgetNotificationsEnabled = useSettingsStore(
    (s) => s.setBudgetNotificationsEnabled,
  );
  const setRetentionDays = useSettingsStore((s) => s.setRetentionDays);
  const setRetentionAutoCleanup = useSettingsStore(
    (s) => s.setRetentionAutoCleanup,
  );

  const proxyStatus = useUsageStore((s) => s.proxyStatus);
  const fetchProxyStatus = useUsageStore((s) => s.fetchProxyStatus);

  const [isProxyActionRunning, setIsProxyActionRunning] = useState(false);
  const [isClearDataRunning, setIsClearDataRunning] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  const retentionValues = useMemo(
    () => new Set(RETENTION_OPTIONS.map((option) => String(option.value))),
    [],
  );

  useEffect(() => {
    void fetchProxyStatus();
  }, [fetchProxyStatus]);

  const isProxyRunning = proxyStatus?.isRunning ?? settings.proxy.enabled;
  const activeProxyPort = proxyStatus?.port ?? settings.proxy.port;

  async function handleToggleProxy(): Promise<void> {
    setFeedback(null);
    setIsProxyActionRunning(true);
    try {
      await toggleProxy();
      await fetchProxyStatus();
    } finally {
      setIsProxyActionRunning(false);
    }
  }

  async function handleRestartProxy(): Promise<void> {
    setFeedback(null);
    setIsProxyActionRunning(true);
    try {
      if (isProxyRunning) {
        await toggleProxy();
      }
      await toggleProxy();
      await fetchProxyStatus();
    } finally {
      setIsProxyActionRunning(false);
    }
  }

  async function handleTestConnectivity(): Promise<void> {
    setFeedback(null);

    if (typeof window === "undefined") {
      return;
    }

    try {
      const status = await window.api.getProxyStatus();
      if (status.isRunning) {
        setFeedback({
          tone: "success",
          message: `Proxy is reachable on port ${status.port ?? settings.proxy.port}.`,
        });
      } else {
        setFeedback({
          tone: "error",
          message:
            "Proxy is not running. Start it and retry connectivity test.",
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: `Connectivity test failed: ${String(error)}`,
      });
    }
  }

  function handleRetentionChange(value: string): void {
    if (!retentionValues.has(value)) {
      return;
    }
    setRetentionDays(Number(value) as RetentionPeriodDays);
  }

  async function handleClearDataConfirm(): Promise<void> {
    setIsClearDialogOpen(false);
    setFeedback(null);
    setIsClearDataRunning(true);

    try {
      const result = await window.api.clearAllData();
      setFeedback({
        tone: "success",
        message: formatClearDataResult(result),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: `Clear data failed: ${String(error)}`,
      });
    } finally {
      setIsClearDataRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {storeError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {storeError}
        </div>
      )}

      {feedback && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            feedback.tone === "success" &&
              "border-emerald-300 bg-emerald-50 text-emerald-700",
            feedback.tone === "error" &&
              "border-destructive/40 bg-destructive/10 text-destructive",
            feedback.tone === "info" &&
              "border-border bg-muted text-foreground",
          )}
        >
          {feedback.tone === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Dismiss feedback"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Proxy Configuration</CardTitle>
          <CardDescription>
            Configure proxy runtime settings and validate local connectivity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProxyPortControl
            key={settings.proxy.port}
            port={settings.proxy.port}
            onSave={setProxyPort}
          />

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="proxy-auto-start">Auto-start proxy</Label>
              <p className="text-xs text-muted-foreground">
                Start the proxy automatically when the app launches.
              </p>
            </div>
            <Switch
              id="proxy-auto-start"
              checked={settings.proxy.autoStart}
              onCheckedChange={setProxyAutoStart}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Status</div>
              <div className="text-xs text-muted-foreground">
                {isProxyRunning
                  ? `Running on port ${activeProxyPort}`
                  : "Stopped"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={isProxyRunning ? "outline" : "default"}
                onClick={() => void handleToggleProxy()}
                disabled={isProxyActionRunning}
              >
                {isProxyActionRunning && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {isProxyRunning ? "Stop" : "Start"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleRestartProxy()}
                disabled={isProxyActionRunning}
              >
                {isProxyActionRunning && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Restart
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleTestConnectivity()}
                disabled={isProxyActionRunning}
              >
                Test Connectivity
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
          <CardDescription>
            Adjust theme and formatting preferences used throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={settings.display.theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <SelectTrigger id="theme" className="w-full">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={settings.display.currency}
              onValueChange={(value) => setCurrency(value)}
            >
              <SelectTrigger id="currency" className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="number-format">Number Format</Label>
            <Select
              value={settings.display.numberFormat}
              onValueChange={(value) => setNumberFormat(value as NumberFormat)}
            >
              <SelectTrigger id="number-format" className="w-full">
                <SelectValue placeholder="Select number format" />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-format">Date Format</Label>
            <Select
              value={settings.display.dateFormat}
              onValueChange={(value) => setDateFormat(value as DateFormat)}
            >
              <SelectTrigger id="date-format" className="w-full">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget Settings</CardTitle>
          <CardDescription>
            Configure monthly limits and alert thresholds for spend tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MonthlyBudgetControl
            key={settings.budget.monthlyBudget}
            budget={settings.budget.monthlyBudget}
            onSave={setMonthlyBudget}
          />

          <div className="space-y-2">
            <Label htmlFor="budget-threshold">
              Alert Threshold ({settings.budget.alertThreshold}%)
            </Label>
            <Input
              id="budget-threshold"
              type="range"
              min={BUDGET_ALERT_MIN}
              max={BUDGET_ALERT_MAX}
              step={1}
              value={settings.budget.alertThreshold}
              onChange={(event) =>
                setBudgetAlertThreshold(Number(event.target.value))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="budget-notifications">Budget notifications</Label>
              <p className="text-xs text-muted-foreground">
                Notify when spending crosses the alert threshold.
              </p>
            </div>
            <Switch
              id="budget-notifications"
              checked={settings.budget.notificationsEnabled}
              onCheckedChange={setBudgetNotificationsEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Retention</CardTitle>
          <CardDescription>
            Control how long usage history is retained and whether cleanup runs
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="retention-days">Retention Period</Label>
            <Select
              value={String(settings.dataRetention.retentionDays)}
              onValueChange={handleRetentionChange}
            >
              <SelectTrigger id="retention-days" className="w-full">
                <SelectValue placeholder="Select retention period" />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="auto-cleanup">Auto-cleanup</Label>
              <p className="text-xs text-muted-foreground">
                Automatically remove records older than the selected retention
                period.
              </p>
            </div>
            <Switch
              id="auto-cleanup"
              checked={settings.dataRetention.autoCleanup}
              onCheckedChange={setRetentionAutoCleanup}
            />
          </div>

          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Danger Zone
              </p>
              <p className="text-xs text-muted-foreground">
                Clear all usage data from local storage and summaries.
              </p>
              <Button
                variant="destructive"
                onClick={() => setIsClearDialogOpen(true)}
              >
                Clear All Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This action removes usage history and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsClearDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClearDataConfirm()}
              disabled={isClearDataRunning}
            >
              Confirm Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
