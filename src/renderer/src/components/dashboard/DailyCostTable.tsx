import { useState, useMemo } from "react";
import type { DailySummary, ModelBreakdown, Period } from "@/types/usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCost, formatTokens } from "@/lib/format";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface DailyCostTableProps {
  summaries: DailySummary[];
  modelBreakdown: ModelBreakdown[];
  period: Period;
}

type SortField =
  | "date"
  | "input_cost"
  | "output_cost"
  | "total_cost"
  | "request_count"
  | "avg_cost_per_request";
type SortDir = "asc" | "desc";

const ROWS_PER_PAGE = 14;

function TrendArrow({
  current,
  previous,
}: {
  current: number;
  previous: number | undefined;
}): React.JSX.Element {
  if (previous === undefined) return <span />;
  if (current > previous) {
    return <ArrowUp className="size-3 text-emerald-500" />;
  }
  if (current < previous) {
    return <ArrowDown className="size-3 text-red-500" />;
  }
  return <Minus className="size-3 text-muted-foreground" />;
}

export default function DailyCostTable({
  summaries,
  modelBreakdown,
}: DailyCostTableProps): React.JSX.Element {
  const [mode, setMode] = useState<"aggregate" | "per-model">("aggregate");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [modelFilter, setModelFilter] = useState<string>("all");

  interface TableRow {
    date: string;
    model_name: string;
    input_cost: number;
    output_cost: number;
    total_cost: number;
    request_count: number;
  }

  // Aggregate rows: group by date, sum across providers/models
  const aggregateRows = useMemo(() => {
    const map = new Map<string, TableRow>();

    for (const s of summaries) {
      const existing = map.get(s.date);
      if (existing) {
        existing.input_cost += s.input_cost;
        existing.output_cost += s.output_cost;
        existing.total_cost += s.total_cost;
        existing.request_count += s.request_count;
      } else {
        map.set(s.date, {
          date: s.date,
          model_name: "",
          input_cost: s.input_cost,
          output_cost: s.output_cost,
          total_cost: s.total_cost,
          request_count: s.request_count,
        });
      }
    }

    return Array.from(map.values());
  }, [summaries]);

  // Per-model rows: each summary is already keyed by date+provider+model
  const perModelRows = useMemo(() => {
    const filtered =
      modelFilter === "all"
        ? summaries
        : summaries.filter((s) => s.model_id === modelFilter);

    return filtered.map((s) => ({
      date: s.date,
      model_name:
        modelBreakdown.find((m) => m.model_id === s.model_id)?.model_name ??
        s.model_id,
      input_cost: s.input_cost,
      output_cost: s.output_cost,
      total_cost: s.total_cost,
      request_count: s.request_count,
    }));
  }, [summaries, modelFilter, modelBreakdown]);

  // Sort aggregate rows
  const sortedAggregate = useMemo(() => {
    const sorted = [...aggregateRows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "input_cost":
          cmp = a.input_cost - b.input_cost;
          break;
        case "output_cost":
          cmp = a.output_cost - b.output_cost;
          break;
        case "total_cost":
          cmp = a.total_cost - b.total_cost;
          break;
        case "request_count":
          cmp = a.request_count - b.request_count;
          break;
        case "avg_cost_per_request":
          cmp =
            (a.request_count > 0 ? a.total_cost / a.request_count : 0) -
            (b.request_count > 0 ? b.total_cost / b.request_count : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [aggregateRows, sortField, sortDir]);

  // Sort per-model rows
  const sortedPerModel = useMemo(() => {
    const sorted = [...perModelRows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "input_cost":
          cmp = a.input_cost - b.input_cost;
          break;
        case "output_cost":
          cmp = a.output_cost - b.output_cost;
          break;
        case "total_cost":
          cmp = a.total_cost - b.total_cost;
          break;
        case "request_count":
          cmp = a.request_count - b.request_count;
          break;
        default:
          cmp = a.date.localeCompare(b.date);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [perModelRows, sortField, sortDir]);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  // Totals for aggregate mode
  const totals = useMemo(() => {
    const rows = mode === "aggregate" ? aggregateRows : perModelRows;
    return rows.reduce(
      (acc, r) => ({
        input_cost: acc.input_cost + r.input_cost,
        output_cost: acc.output_cost + r.output_cost,
        total_cost: acc.total_cost + r.total_cost,
        request_count: acc.request_count + r.request_count,
      }),
      { input_cost: 0, output_cost: 0, total_cost: 0, request_count: 0 },
    );
  }, [mode, aggregateRows, perModelRows]);

  const currentData = mode === "aggregate" ? sortedAggregate : sortedPerModel;
  const totalPages = Math.max(1, Math.ceil(currentData.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * ROWS_PER_PAGE;
  const pageRows = currentData.slice(startIdx, startIdx + ROWS_PER_PAGE);
  const showFrom = currentData.length > 0 ? startIdx + 1 : 0;
  const showTo = Math.min(startIdx + ROWS_PER_PAGE, currentData.length);

  // Build a map of total_cost by date for trend arrows (aggregate mode only)
  const aggregateByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of aggregateRows) {
      map.set(r.date, r.total_cost);
    }
    return map;
  }, [aggregateRows]);

  // Sorted dates for looking up previous day
  const sortedDates = useMemo(() => {
    return Array.from(aggregateByDate.keys()).sort();
  }, [aggregateByDate]);

  const getPreviousDayCost = (date: string): number | undefined => {
    const idx = sortedDates.indexOf(date);
    if (idx <= 0) return undefined;
    return aggregateByDate.get(sortedDates[idx - 1]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Cost Per Day Breakdown</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant={mode === "aggregate" ? "default" : "outline"}
            onClick={() => {
              setMode("aggregate");
              setPage(0);
            }}
          >
            Aggregate
          </Button>
          <Button
            size="xs"
            variant={mode === "per-model" ? "default" : "outline"}
            onClick={() => {
              setMode("per-model");
              setPage(0);
            }}
          >
            Per-Model
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Model filter for per-model mode */}
        {mode === "per-model" && (
          <div className="mb-4">
            <Select
              value={modelFilter}
              onValueChange={(v) => {
                setModelFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by model" />
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
          </div>
        )}

        {currentData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No data available for this period
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer text-xs"
                      onClick={() => handleSort("date")}
                    >
                      Date{" "}
                      {sortField === "date"
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : ""}
                    </TableHead>
                    {mode === "per-model" && (
                      <TableHead className="text-xs">Model</TableHead>
                    )}
                    <TableHead
                      className="cursor-pointer text-right text-xs"
                      onClick={() => handleSort("input_cost")}
                    >
                      Input Cost{" "}
                      {sortField === "input_cost"
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : ""}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right text-xs"
                      onClick={() => handleSort("output_cost")}
                    >
                      Output Cost{" "}
                      {sortField === "output_cost"
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : ""}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right text-xs"
                      onClick={() => handleSort("total_cost")}
                    >
                      Total Cost{" "}
                      {sortField === "total_cost"
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : ""}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right text-xs"
                      onClick={() => handleSort("request_count")}
                    >
                      Requests{" "}
                      {sortField === "request_count"
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : ""}
                    </TableHead>
                    {mode === "aggregate" && (
                      <TableHead
                        className="cursor-pointer text-right text-xs"
                        onClick={() => handleSort("avg_cost_per_request")}
                      >
                        Avg Cost/Req{" "}
                        {sortField === "avg_cost_per_request"
                          ? sortDir === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row, idx) => {
                    const prevCost =
                      mode === "aggregate"
                        ? getPreviousDayCost(row.date)
                        : undefined;

                    return (
                      <TableRow key={`${row.date}-${idx}`}>
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1">
                            {row.date}
                            {mode === "aggregate" && (
                              <TrendArrow
                                current={row.total_cost}
                                previous={prevCost}
                              />
                            )}
                          </span>
                        </TableCell>
                        {mode === "per-model" && (
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {row.model_name}
                          </TableCell>
                        )}
                        <TableCell className="table-nums text-right text-sm">
                          {formatCost(row.input_cost)}
                        </TableCell>
                        <TableCell className="table-nums text-right text-sm">
                          {formatCost(row.output_cost)}
                        </TableCell>
                        <TableCell className="table-nums text-right text-sm font-medium">
                          {formatCost(row.total_cost)}
                        </TableCell>
                        <TableCell className="table-nums text-right text-sm">
                          {formatTokens(row.request_count)}
                        </TableCell>
                        {mode === "aggregate" && (
                          <TableCell className="table-nums text-right text-sm">
                            {row.request_count > 0
                              ? formatCost(row.total_cost / row.request_count)
                              : "$0.00"}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="border-t-2 font-medium">
                    <TableCell className="text-sm">Total</TableCell>
                    {mode === "per-model" && <TableCell />}
                    <TableCell className="table-nums text-right text-sm">
                      {formatCost(totals.input_cost)}
                    </TableCell>
                    <TableCell className="table-nums text-right text-sm">
                      {formatCost(totals.output_cost)}
                    </TableCell>
                    <TableCell className="table-nums text-right text-sm font-semibold">
                      {formatCost(totals.total_cost)}
                    </TableCell>
                    <TableCell className="table-nums text-right text-sm">
                      {formatTokens(totals.request_count)}
                    </TableCell>
                    {mode === "aggregate" && (
                      <TableCell className="table-nums text-right text-sm">
                        {totals.request_count > 0
                          ? formatCost(totals.total_cost / totals.request_count)
                          : "$0.00"}
                      </TableCell>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {showFrom}–{showTo} of {currentData.length}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
