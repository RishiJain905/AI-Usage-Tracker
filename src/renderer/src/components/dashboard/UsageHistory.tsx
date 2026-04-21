import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FileJson,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useUsageStore } from "@/stores/usageStore";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UsageLog } from "@/types/usage";

const ROWS_PER_PAGE = 50;

type HistoryLocationState = {
  focusSearch?: boolean;
};

/** Format latency from milliseconds to human-readable string */
function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format ISO date string to a readable time */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function UsageHistory(): React.JSX.Element {
  const location = useLocation();
  const period = useUsageStore((s) => s.period);
  const setPeriod = useUsageStore((s) => s.setPeriod);
  const usageLogs = useUsageStore((s) => s.usageLogs);
  const modelBreakdown = useUsageStore((s) => s.modelBreakdown);
  const isLoading = useUsageStore((s) => s.isLoading);
  const error = useUsageStore((s) => s.error);
  const fetchAll = useUsageStore((s) => s.fetchAll);
  const fetchUsageLogs = useUsageStore((s) => s.fetchUsageLogs);
  const setupEventListeners = useUsageStore((s) => s.setupEventListeners);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination state
  const [page, setPage] = useState(0);

  // Expanded row state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const focusSearchRequestedRef = useRef(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [csvGroupByModel, setCsvGroupByModel] = useState(false);
  const [csvIncludeTotal, setCsvIncludeTotal] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportTone, setExportTone] = useState<"success" | "error" | null>(
    null,
  );

  // Derive distinct providers from logs
  const distinctProviders = useMemo(() => {
    const providerSet = new Map<string, string>();
    for (const log of usageLogs) {
      if (!providerSet.has(log.provider_id)) {
        providerSet.set(log.provider_id, log.provider_id);
      }
    }
    return Array.from(providerSet.entries());
  }, [usageLogs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = [...usageLogs];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.model_id?.toLowerCase().includes(query) ||
          log.endpoint?.toLowerCase().includes(query),
      );
    }

    // Provider filter
    if (providerFilter !== "all") {
      result = result.filter((log) => log.provider_id === providerFilter);
    }

    // Model filter
    if (modelFilter !== "all") {
      result = result.filter((log) => log.model_id === modelFilter);
    }

    // Status filter
    if (statusFilter === "success") {
      result = result.filter((log) => !log.is_error);
    } else if (statusFilter === "error") {
      result = result.filter((log) => log.is_error);
    }

    // Sort by requested_at descending
    result.sort((a, b) => {
      const dateA = new Date(a.requested_at).getTime();
      const dateB = new Date(b.requested_at).getTime();
      return dateB - dateA;
    });

    return result;
  }, [usageLogs, searchQuery, providerFilter, modelFilter, statusFilter]);

  // Pagination
  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ROWS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * ROWS_PER_PAGE;
  const pageRows = filteredLogs.slice(startIdx, startIdx + ROWS_PER_PAGE);
  const showFrom = filteredLogs.length > 0 ? startIdx + 1 : 0;
  const showTo = Math.min(startIdx + ROWS_PER_PAGE, filteredLogs.length);

  // Reset page when filters change
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(0);
  }, []);

  const handleProviderChange = useCallback((value: string) => {
    setProviderFilter(value);
    setPage(0);
  }, []);

  const handleModelChange = useCallback((value: string) => {
    setModelFilter(value);
    setPage(0);
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(0);
  }, []);

  const toggleRow = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  const runExport = useCallback(
    async (type: "csv" | "json" | "summary" | "html"): Promise<void> => {
      setIsExporting(true);
      setExportMessage(null);
      setExportTone(null);
      try {
        let content: string;
        let defaultName: string;
        let format: "csv" | "json" | "html";

        const baseOptions: Record<string, unknown> = {
          period,
          ...(providerFilter !== "all" && { providerId: providerFilter }),
          ...(modelFilter !== "all" && { modelId: modelFilter }),
        };

        switch (type) {
          case "csv": {
            const options = {
              ...baseOptions,
              ...(csvGroupByModel && { groupByModel: true }),
              ...(csvIncludeTotal && { includeTotal: true }),
            };
            content = await window.api.exportCsv(options);
            defaultName = `usage-${period}.csv`;
            format = "csv";
            break;
          }
          case "json": {
            content = await window.api.exportJson(baseOptions);
            defaultName = `usage-${period}.json`;
            format = "json";
            break;
          }
          case "summary": {
            const options = {
              ...baseOptions,
              includeSummary: true,
              includePerModelSummary: true,
              includeLogs: false,
            };
            content = await window.api.exportJson(options);
            defaultName = `usage-summary-${period}.json`;
            format = "json";
            break;
          }
          case "html": {
            content = await window.api.exportHtmlReport(baseOptions);
            defaultName = `usage-report-${period}.html`;
            format = "html";
            break;
          }
        }

        const result = await window.api.exportSaveFile({
          content,
          defaultName,
          format,
        });
        if (!result.canceled && result.filePath) {
          setExportTone("success");
          setExportMessage(`Saved to ${result.filePath}`);
        }
      } catch (err) {
        setExportTone("error");
        setExportMessage(`Export failed: ${String(err)}`);
      } finally {
        setIsExporting(false);
      }
    },
    [period, providerFilter, modelFilter, csvGroupByModel, csvIncludeTotal],
  );

  useEffect(() => {
    const state = location.state as HistoryLocationState | null;
    if (state?.focusSearch) {
      focusSearchRequestedRef.current = true;
    }
  }, [location.state]);

  useEffect(() => {
    if (!focusSearchRequestedRef.current) {
      return;
    }

    const searchInput = document.getElementById(
      "usage-history-search",
    ) as HTMLInputElement | null;

    if (searchInput) {
      searchInput.focus();
      searchInput.select();
      focusSearchRequestedRef.current = false;
      return;
    }

    if (!isLoading && usageLogs.length === 0) {
      focusSearchRequestedRef.current = false;
    }
  }, [isLoading, location.pathname, location.state, usageLogs.length]);

  // Initial fetch and event listeners
  useEffect(() => {
    fetchAll();
    fetchUsageLogs({ limit: 200, offset: 0 });
    const cleanup = setupEventListeners();
    return cleanup;
  }, [fetchAll, fetchUsageLogs, setupEventListeners]);

  // Re-fetch logs when period changes
  useEffect(() => {
    fetchUsageLogs({ limit: 200, offset: 0 });
  }, [period, fetchUsageLogs]);

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Failed to load usage history"
          message={error}
          onRetry={() => {
            fetchAll();
            fetchUsageLogs({ limit: 200, offset: 0 });
          }}
        />
      </div>
    );
  }

  if (!isLoading && usageLogs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Usage History</h1>
          <div className="flex items-center gap-2">
            <PeriodSelector period={period} onChange={setPeriod} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={csvGroupByModel}
                  onCheckedChange={setCsvGroupByModel}
                  disabled={isExporting}
                >
                  Group by Model
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={csvIncludeTotal}
                  onCheckedChange={setCsvIncludeTotal}
                  disabled={isExporting}
                >
                  Include Total Row
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void runExport("csv")}
                  disabled={isExporting}
                >
                  <FileSpreadsheet className="mr-2 size-4" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void runExport("json")}
                  disabled={isExporting}
                >
                  <FileJson className="mr-2 size-4" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void runExport("summary")}
                  disabled={isExporting}
                >
                  <FileJson className="mr-2 size-4" />
                  Export Summary (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void runExport("html")}
                  disabled={isExporting}
                >
                  <FileText className="mr-2 size-4" />
                  Export HTML Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {exportMessage && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              exportTone === "success" &&
                "border-emerald-300 bg-emerald-50 text-emerald-700",
              exportTone === "error" &&
                "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {exportTone === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <span>{exportMessage}</span>
          </div>
        )}
        <EmptyState
          title="No usage history"
          description="Start making API requests through the proxy to see them here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Usage History</h1>
        <div className="flex items-center gap-2">
          <PeriodSelector period={period} onChange={setPeriod} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={csvGroupByModel}
                onCheckedChange={setCsvGroupByModel}
                disabled={isExporting}
              >
                Group by Model
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={csvIncludeTotal}
                onCheckedChange={setCsvIncludeTotal}
                disabled={isExporting}
              >
                Include Total Row
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void runExport("csv")}
                disabled={isExporting}
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void runExport("json")}
                disabled={isExporting}
              >
                <FileJson className="mr-2 size-4" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void runExport("summary")}
                disabled={isExporting}
              >
                <FileJson className="mr-2 size-4" />
                Export Summary (JSON)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void runExport("html")}
                disabled={isExporting}
              >
                <FileText className="mr-2 size-4" />
                Export HTML Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {exportMessage && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            exportTone === "success" &&
              "border-emerald-300 bg-emerald-50 text-emerald-700",
            exportTone === "error" &&
              "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {exportTone === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <span>{exportMessage}</span>
        </div>
      )}

      {isLoading && usageLogs.length === 0 ? (
        <LoadingSpinner size="lg" message="Loading usage history…" />
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="usage-history-search"
              placeholder="Search model, endpoint..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-[220px]"
            />
            <Select value={providerFilter} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {distinctProviders.map(([id]) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={handleModelChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {modelBreakdown.map((m) => (
                  <SelectItem key={m.model_id} value={m.model_id}>
                    {m.model_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-right text-xs">Tokens</TableHead>
                  <TableHead className="text-right text-xs">Cost</TableHead>
                  <TableHead className="text-right text-xs">Latency</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedRow === log.id}
                    onToggle={toggleRow}
                  />
                ))}
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No matching logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filteredLogs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {showFrom}–{showTo} of {filteredLogs.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-3" />
                  Prev
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={safePage >= totalPages - 1}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                >
                  Next
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Individual log row with expandable details */
function LogRow({
  log,
  isExpanded,
  onToggle,
}: {
  log: UsageLog;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}): React.JSX.Element {
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => onToggle(log.id)}
        aria-expanded={isExpanded}
      >
        <TableCell className="text-xs">
          {formatTime(log.requested_at)}
        </TableCell>
        <TableCell className="text-xs">{log.provider_id}</TableCell>
        <TableCell className="max-w-[200px] truncate text-xs">
          {log.model_id}
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums">
          {formatTokens(log.total_tokens)}
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums">
          {formatCost(log.total_cost)}
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums">
          {formatLatency(log.request_duration_ms)}
        </TableCell>
        <TableCell>
          {log.is_error ? (
            <Badge variant="destructive" className="text-[10px]">
              Error
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              OK
            </Badge>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
              <DetailItem label="Endpoint" value={log.endpoint ?? "—"} />
              <DetailItem label="Method" value={log.method} />
              <DetailItem
                label="Streaming"
                value={log.is_streaming ? "Yes" : "No"}
              />
              <DetailItem
                label="Estimated"
                value={log.is_estimated ? "Yes" : "No"}
              />
              <DetailItem label="App Name" value={log.app_name ?? "—"} />
              <DetailItem label="Tags" value={log.tags ?? "—"} />
              <DetailItem
                label="Cached Read Tokens"
                value={formatTokens(log.cached_read_tokens)}
              />
              <DetailItem
                label="Cached Write Tokens"
                value={formatTokens(log.cached_write_tokens)}
              />
              <DetailItem
                label="Image Tokens"
                value={formatTokens(log.image_tokens)}
              />
              <DetailItem
                label="Audio Tokens"
                value={formatTokens(log.audio_tokens)}
              />
              <DetailItem
                label="Reasoning Tokens"
                value={formatTokens(log.reasoning_tokens)}
              />
              {log.error_message && (
                <DetailItem
                  label="Error Message"
                  value={log.error_message}
                  className="text-destructive"
                />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Small helper for displaying a label-value pair in the expanded row */
function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={className}>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
