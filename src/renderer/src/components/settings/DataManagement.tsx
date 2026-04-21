import { useEffect, useRef, useState } from "react";
import {
  Database,
  Upload,
  Trash2,
  Loader2,
  CloudDownload,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileJson,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

function formatBytes(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function DataManagement(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const retentionDays = settings.dataRetention.retentionDays;
  const autoCleanup = settings.dataRetention.autoCleanup;

  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  // Database info
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [dbPath, setDbPath] = useState<string>("Unavailable");

  // Backup
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupPath, setLastBackupPath] = useState<string | null>(null);

  // Restore
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [restorePath, setRestorePath] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup
  const [isCleaning, setIsCleaning] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] = useState<{
    deletedCount: number;
    retentionDays: number;
  } | null>(null);

  // Export all
  const [isExportingAll, setIsExportingAll] = useState(false);

  // ZhipuAI sync
  const [apiKey, setApiKey] = useState("");
  const [storedApiKeyProvider, setStoredApiKeyProvider] = useState<{
    providerId: string;
    providerName: string;
  } | null>(null);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(
    null,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    importedCount: number;
    skippedCount: number;
    totalTokens: number;
    totalCost: number;
  } | null>(null);

  // Load metadata on mount
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [sizeStr, pathStr] = await Promise.all([
          window.api.dbGetSetting("database_size_bytes"),
          window.api.dbGetSetting("database_path"),
        ]);
        if (sizeStr) {
          const parsed = Number(sizeStr);
          setDbSizeBytes(
            Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
          );
        }
        if (pathStr) setDbPath(pathStr);

        // Check for stored GLM API key
        const keys = await window.api.listApiKeyMetadata();
        const glmKey = keys.find((k) => k.providerId === "glm" && k.hasKey);
        if (glmKey) {
          setStoredApiKeyProvider({
            providerId: glmKey.providerId,
            providerName: glmKey.providerName,
          });
        }

        // Load last sync timestamp
        const syncStatus = await window.api.syncZhipuAiStatus();
        setLastSyncTimestamp(syncStatus.lastSyncTimestamp);
      } catch (err) {
        setFeedback({ tone: "error", message: String(err) });
      }
    };
    void load();
  }, []);

  const handleBackup = async (): Promise<void> => {
    setFeedback(null);
    setIsBackingUp(true);
    try {
      const result = await window.api.dataBackup();
      if (result.ok && result.backupPath) {
        setLastBackupPath(result.backupPath);
        setFeedback({
          tone: "success",
          message: `Backup created: ${result.backupPath}`,
        });
      } else {
        setFeedback({
          tone: "error",
          message: result.error ?? "Backup failed",
        });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Backup failed: ${String(err)}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      setRestorePath((file as unknown as { path?: string }).path ?? file.name);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openFilePicker = (): void => {
    fileInputRef.current?.click();
  };

  const handleRestore = async (): Promise<void> => {
    if (!restorePath.trim()) {
      setFeedback({ tone: "error", message: "Please select a backup file" });
      return;
    }
    setIsRestoreDialogOpen(false);
    setFeedback(null);
    setIsRestoring(true);
    try {
      const result = await window.api.dataRestore(restorePath.trim());
      if (result.ok) {
        setFeedback({
          tone: "success",
          message: `Restore completed${result.restartNeeded ? ". Please restart the app." : ""}`,
        });
      } else {
        setFeedback({
          tone: "error",
          message: result.error ?? "Restore failed",
        });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Restore failed: ${String(err)}` });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCleanup = async (): Promise<void> => {
    setFeedback(null);
    setIsCleaning(true);
    try {
      const result = await window.api.dataCleanup(retentionDays);
      if (result.ok) {
        setLastCleanupResult({
          deletedCount: result.deletedCount,
          retentionDays: result.retentionDays,
        });
        setFeedback({
          tone: "success",
          message: `Cleanup complete. Deleted ${result.deletedCount} records.`,
        });
      } else {
        setFeedback({
          tone: "error",
          message: result.error ?? "Cleanup failed",
        });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Cleanup failed: ${String(err)}` });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleExportAllCsv = async (): Promise<void> => {
    setIsExportingAll(true);
    setFeedback(null);
    try {
      const content = await window.api.exportCsv({ period: "all" });
      const result = await window.api.exportSaveFile({
        content,
        defaultName: "ai-usage-all.csv",
        format: "csv",
      });
      if (!result.canceled && result.filePath) {
        setFeedback({
          tone: "success",
          message: `Saved to ${result.filePath}`,
        });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Export failed: ${String(err)}` });
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportAllJson = async (): Promise<void> => {
    setIsExportingAll(true);
    setFeedback(null);
    try {
      const content = await window.api.exportJson({ period: "all" });
      const result = await window.api.exportSaveFile({
        content,
        defaultName: "ai-usage-all.json",
        format: "json",
      });
      if (!result.canceled && result.filePath) {
        setFeedback({
          tone: "success",
          message: `Saved to ${result.filePath}`,
        });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Export failed: ${String(err)}` });
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleSyncZhipuAi = async (): Promise<void> => {
    if (!storedApiKeyProvider && !apiKey.trim()) {
      setFeedback({
        tone: "error",
        message: "Please enter a ZhipuAI API key",
      });
      return;
    }
    setFeedback(null);
    setIsSyncing(true);
    try {
      const result = await window.api.syncZhipuAi(apiKey.trim());
      if (result.ok && result.result) {
        setSyncResult({
          importedCount: result.result.importedCount,
          skippedCount: result.result.skippedCount,
          totalTokens: result.result.totalTokens,
          totalCost: result.result.totalCost,
        });
        const ts = await window.api.syncZhipuAiStatus();
        setLastSyncTimestamp(ts.lastSyncTimestamp);
        setFeedback({
          tone: "success",
          message: `Sync complete. Imported ${result.result.importedCount} records.`,
        });
      } else {
        setFeedback({ tone: "error", message: result.error ?? "Sync failed" });
      }
    } catch (err) {
      setFeedback({ tone: "error", message: `Sync failed: ${String(err)}` });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
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
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Database Info */}
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>
            Current database size and retention policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Path</span>
              <span className="block break-all font-mono text-sm">
                {dbPath}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Size</span>
              <span className="block text-sm font-medium">
                {formatBytes(dbSizeBytes)}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                Retention Period
              </span>
              <span className="block text-sm font-medium">
                {retentionDays === 0 ? "Forever" : `${retentionDays} days`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Auto-cleanup
              </span>
              <Badge
                variant={autoCleanup ? "default" : "secondary"}
                className="text-[10px]"
              >
                {autoCleanup ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            Create a backup copy of the current database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={() => void handleBackup()} disabled={isBackingUp}>
              {isBackingUp && <Loader2 className="size-4 animate-spin" />}
              <Database className="size-4" />
              Backup Database
            </Button>
            {lastBackupPath && (
              <span className="text-xs text-muted-foreground break-all">
                Last backup: {lastBackupPath}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Restore */}
      <Card>
        <CardHeader>
          <CardTitle>Restore</CardTitle>
          <CardDescription>
            Restore the database from a previous backup. The app may need to
            restart afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Backup file path..."
              value={restorePath}
              onChange={(e) => setRestorePath(e.target.value)}
              className="sm:max-w-md"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={openFilePicker}
                disabled={isRestoring}
              >
                <Upload className="size-4" />
                Browse
              </Button>
              <Button
                variant="default"
                onClick={() => setIsRestoreDialogOpen(true)}
                disabled={isRestoring || !restorePath.trim()}
              >
                {isRestoring && <Loader2 className="size-4 animate-spin" />}
                Restore
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            Restoring will replace the current database. A pre-restore backup is
            automatically created.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            className="hidden"
            onChange={handleFileSelect}
          />
        </CardContent>
      </Card>

      {/* Restore confirmation dialog */}
      <Dialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Database?</DialogTitle>
            <DialogDescription>
              This will replace the current database with the selected backup
              file. Current data will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRestoreDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRestore()}
              disabled={isRestoring}
            >
              {isRestoring && <Loader2 className="size-4 animate-spin" />}
              Confirm Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup */}
      <Card>
        <CardHeader>
          <CardTitle>Cleanup</CardTitle>
          <CardDescription>
            Remove usage records older than the retention period.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                Retention:{" "}
                {retentionDays === 0 ? "Forever" : `${retentionDays} days`}
              </p>
              <p className="text-xs text-muted-foreground">
                Records older than this will be permanently deleted.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void handleCleanup()}
              disabled={isCleaning || retentionDays === 0}
            >
              {isCleaning && <Loader2 className="size-4 animate-spin" />}
              <Trash2 className="size-4" />
              Run Cleanup Now
            </Button>
          </div>
          {lastCleanupResult && (
            <div className="rounded-md bg-muted p-3 text-xs">
              <p className="font-medium">Last cleanup result</p>
              <p className="text-muted-foreground">
                Deleted: {lastCleanupResult.deletedCount} records (retention:{" "}
                {lastCleanupResult.retentionDays} days)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export All Data */}
      <Card>
        <CardHeader>
          <CardTitle>Export All Data</CardTitle>
          <CardDescription>
            Export the entire dataset regardless of current filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleExportAllCsv()}
              disabled={isExportingAll}
            >
              <FileSpreadsheet className="size-4" />
              Export All as CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExportAllJson()}
              disabled={isExportingAll}
            >
              <FileJson className="size-4" />
              Export All as JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ZhipuAI Sync */}
      <Card>
        <CardHeader>
          <CardTitle>ZhipuAI Sync</CardTitle>
          <CardDescription>
            Import missing usage data from your ZhipuAI account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {storedApiKeyProvider ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>
                API key found for{" "}
                <span className="font-medium">
                  {storedApiKeyProvider.providerName}
                </span>
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="zhipu-api-key">ZhipuAI API Key</Label>
              <Input
                id="zhipu-api-key"
                type="password"
                placeholder="Enter your ZhipuAI API key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                No stored API key found. Enter one above to sync.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void handleSyncZhipuAi()}
              disabled={isSyncing || (!storedApiKeyProvider && !apiKey.trim())}
            >
              {isSyncing && <Loader2 className="size-4 animate-spin" />}
              <CloudDownload className="size-4" />
              Sync Missing Data
            </Button>
            {lastSyncTimestamp && (
              <span className="text-xs text-muted-foreground">
                Last sync: {new Date(lastSyncTimestamp).toLocaleString()}
              </span>
            )}
          </div>
          {syncResult && (
            <div className="space-y-1 rounded-md bg-muted p-3 text-xs">
              <p className="font-medium">Last sync result</p>
              <p className="text-muted-foreground">
                Imported: {syncResult.importedCount} &bull; Skipped:{" "}
                {syncResult.skippedCount}
              </p>
              <p className="text-muted-foreground">
                Tokens: {syncResult.totalTokens} &bull; Cost:{" "}
                {syncResult.totalCost.toFixed(4)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
