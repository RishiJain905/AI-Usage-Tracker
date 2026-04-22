import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTokens, formatCost, formatRelativeTime } from "@/lib/format";
import type { UsageLog } from "@/types/usage";

interface RecentActivityProps {
  logs: UsageLog[];
  loading?: boolean;
}

export default function RecentActivity({
  logs,
  loading,
}: RecentActivityProps): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new logs arrive (most recent first)
  useEffect(() => {
    if (scrollRef.current && logs.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No activity recorded yet"
            description="Recent API calls will appear here as they are tracked."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;

                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    {/* Expandable row */}
                    {isExpanded ? (
                      <>
                        {/* Detail row */}
                        <TableCell colSpan={6} className="bg-accent/30">
                          <div className="grid grid-cols-2 gap-2 text-xs py-1">
                            <div>
                              <span className="text-muted-foreground">
                                Endpoint:{" "}
                              </span>
                              <span className="font-medium">
                                {log.endpoint ?? "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Method:{" "}
                              </span>
                              <span className="font-medium">{log.method}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Prompt tokens:{" "}
                              </span>
                              <span className="font-medium tabular-nums">
                                {log.prompt_tokens.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Completion tokens:{" "}
                              </span>
                              <span className="font-medium tabular-nums">
                                {log.completion_tokens.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Duration:{" "}
                              </span>
                              <span className="font-medium">
                                {log.request_duration_ms
                                  ? `${(log.request_duration_ms / 1000).toFixed(1)}s`
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Source:{" "}
                              </span>
                              <span className="font-medium">{log.source}</span>
                            </div>
                            {log.is_error && log.error_message && (
                              <div className="col-span-2">
                                <span className="text-destructive font-medium">
                                  Error: {log.error_message}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        {/* Status indicator */}
                        <TableCell>
                          <span
                            className={`inline-block size-2 rounded-full ${
                              log.is_error ? "bg-red-500" : "bg-emerald-500"
                            }`}
                          />
                        </TableCell>
                        {/* Model */}
                        <TableCell className="font-medium text-sm truncate max-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{log.model_id}</span>
                            {log.is_streaming && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0 h-4"
                              >
                                Stream
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {/* Provider */}
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4"
                          >
                            {log.provider_id}
                          </Badge>
                        </TableCell>
                        {/* Tokens */}
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatTokens(log.total_tokens)}
                        </TableCell>
                        {/* Cost */}
                        <TableCell className="text-right tabular-nums text-sm">
                          {log.total_cost > 0
                            ? formatCost(log.total_cost)
                            : "Free"}
                        </TableCell>
                        {/* Time */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatRelativeTime(log.requested_at)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
