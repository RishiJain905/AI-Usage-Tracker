import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost, formatPercentage } from "@/lib/format";
import { useModelData } from "@/hooks/useModelData";
import type { Period } from "@/types/usage";

const PAGE_SIZE = 50;

type SortableColumn =
  | "model_name"
  | "provider_name"
  | "input_price_per_million"
  | "output_price_per_million"
  | "total_tokens"
  | "total_cost"
  | "share_of_total";

interface ColumnDef {
  key: SortableColumn;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "model_name", label: "Model", align: "left" },
  { key: "provider_name", label: "Provider", align: "left" },
  { key: "input_price_per_million", label: "Input Price", align: "right" },
  { key: "output_price_per_million", label: "Output Price", align: "right" },
  { key: "total_tokens", label: "Total Usage", align: "right" },
  { key: "total_cost", label: "Total Cost", align: "right" },
  { key: "share_of_total", label: "Share", align: "right" },
];

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortableColumn;
  sortField: SortableColumn;
  sortDirection: "asc" | "desc";
}): React.JSX.Element {
  if (field !== sortField) {
    return <span className="ml-1 text-muted-foreground/40">↕</span>;
  }
  return (
    <span className="ml-1 text-primary">
      {sortDirection === "asc" ? "↑" : "↓"}
    </span>
  );
}

interface ModelComparisonProps {
  period: Period;
}

export default function ModelComparison({
  period: _period,
}: ModelComparisonProps): React.JSX.Element {
  const {
    modelRows,
    sortField,
    sortDirection,
    setSortField,
    setProviderFilter,
  } = useModelData();

  const [page, setPage] = useState(0);
  const [providerFilterValue, setProviderFilterValue] =
    useState<string>("__all__");

  // Derive unique providers for the filter dropdown
  const uniqueProviders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of modelRows) {
      if (!seen.has(row.provider_id)) {
        seen.set(row.provider_id, row.provider_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [modelRows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(modelRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = modelRows.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const handleProviderFilter = (value: string): void => {
    setProviderFilterValue(value);
    setPage(0);
    setProviderFilter(value === "__all__" ? null : value);
  };

  const handleSort = (field: SortableColumn): void => {
    setPage(0);
    setSortField(field);
  };

  if (!modelRows || modelRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No model data"
            description="No model comparison data available for the selected period."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Model Comparison</CardTitle>
        {/* Provider filter */}
        <Select
          value={providerFilterValue}
          onValueChange={handleProviderFilter}
        >
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Providers</SelectItem>
            {uniqueProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`cursor-pointer select-none whitespace-nowrap ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon
                    field={col.key}
                    sortField={sortField as SortableColumn}
                    sortDirection={sortDirection}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.map((row) => (
              <TableRow key={row.model_id}>
                {/* Model */}
                <TableCell className="font-medium text-sm max-w-[200px] truncate">
                  {row.model_name}
                </TableCell>
                {/* Provider */}
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {row.provider_name}
                  </span>
                </TableCell>
                {/* Input price */}
                <TableCell className="text-right tabular-nums text-xs">
                  {row.input_price_per_million > 0
                    ? `$${row.input_price_per_million}/M`
                    : "Free"}
                </TableCell>
                {/* Output price */}
                <TableCell className="text-right tabular-nums text-xs">
                  {row.output_price_per_million > 0
                    ? `$${row.output_price_per_million}/M`
                    : "Free"}
                </TableCell>
                {/* Total usage */}
                <TableCell className="text-right tabular-nums text-sm">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {formatTokens(row.total_tokens)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <span>
                          Prompt:{" "}
                          {formatTokens(
                            row.total_tokens -
                              Math.round(row.total_tokens * 0.4),
                          )}
                          {" · "}Completion:{" "}
                          {formatTokens(Math.round(row.total_tokens * 0.4))}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                {/* Total cost */}
                <TableCell className="text-right tabular-nums text-sm">
                  {row.total_cost > 0 ? formatCost(row.total_cost) : "Free"}
                </TableCell>
                {/* Share */}
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                  {formatPercentage(row.share_of_total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {modelRows.length} model{modelRows.length !== 1 ? "s" : ""} · Page{" "}
              {safePage + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
