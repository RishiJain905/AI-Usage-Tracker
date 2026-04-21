import { useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AboutMetadata {
  appVersion: string;
  databasePath: string;
  databaseSizeBytes: number | null;
  license: string;
}

function parseByteCount(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function formatBytes(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function About(): React.JSX.Element {
  const [meta, setMeta] = useState<AboutMetadata>({
    appVersion: "1.0.0",
    databasePath: "Unavailable",
    databaseSizeBytes: null,
    license: "Proprietary",
  });
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isOpeningDir, setIsOpeningDir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runtime = window.electron.process.versions;

  const rows = useMemo(
    () => [
      { label: "App version", value: meta.appVersion },
      { label: "Electron", value: runtime.electron ?? "Unknown" },
      { label: "Node.js", value: runtime.node ?? "Unknown" },
      { label: "Chrome", value: runtime.chrome ?? "Unknown" },
      { label: "Database path", value: meta.databasePath },
      { label: "Database size", value: formatBytes(meta.databaseSizeBytes) },
      { label: "License", value: meta.license },
    ],
    [
      meta.appVersion,
      meta.databasePath,
      meta.databaseSizeBytes,
      meta.license,
      runtime,
    ],
  );

  useEffect(() => {
    const loadAboutMetadata = async (): Promise<void> => {
      try {
        const [version, dbPath, dbSize, license] = await Promise.all([
          window.api.dbGetSetting("app_version"),
          window.api.dbGetSetting("database_path"),
          window.api.dbGetSetting("database_size_bytes"),
          window.api.dbGetSetting("license_info"),
        ]);

        setMeta({
          appVersion: version ?? "1.0.0",
          databasePath: dbPath ?? "Unavailable",
          databaseSizeBytes: parseByteCount(dbSize),
          license: license ?? "Proprietary",
        });
      } catch (loadError) {
        setError(String(loadError));
      }
    };

    void loadAboutMetadata();
  }, []);

  const checkForUpdates = async (): Promise<void> => {
    setIsCheckingUpdates(true);
    setError(null);
    setNotice(null);

    try {
      await window.api.checkForUpdates();
      setNotice("Update check request sent to main process.");
    } catch {
      setNotice(
        "No update handler is currently wired. Add main IPC handler `app:check-updates` to enable this action.",
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const openDataDirectory = async (): Promise<void> => {
    setIsOpeningDir(true);
    setError(null);
    setNotice(null);

    const copyDatabasePathFallback = async (): Promise<void> => {
      if (meta.databasePath !== "Unavailable") {
        try {
          await navigator.clipboard.writeText(meta.databasePath);
          setNotice(
            "Open-directory IPC is not available. Database path copied to clipboard instead.",
          );
        } catch (clipboardError) {
          setError(String(clipboardError));
        }
      } else {
        setNotice("Database path is unavailable in this build.");
      }
    };

    try {
      const result = await window.api.openDataDirectory(meta.databasePath);

      if (result.ok) {
        setNotice("Data directory open request sent.");
      } else {
        await copyDatabasePathFallback();
      }
    } catch {
      await copyDatabasePathFallback();
    } finally {
      setIsOpeningDir(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>About AI Usage Tracker</CardTitle>
          <CardDescription>
            App metadata, runtime versions, and maintenance actions.
          </CardDescription>
        </div>
        <Badge variant="outline">Settings</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            {notice}
          </p>
        )}

        <div className="grid gap-2 rounded-lg border p-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 md:grid-cols-[180px_1fr]"
            >
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="font-mono text-sm break-all">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void checkForUpdates()}
            disabled={isCheckingUpdates}
          >
            <RefreshCcw className="size-4" />
            Check for updates
          </Button>
          <Button
            variant="outline"
            onClick={() => void openDataDirectory()}
            disabled={isOpeningDir}
          >
            <FolderOpen className="size-4" />
            Open data directory
          </Button>
          <Button variant="link" asChild>
            <a href="https://github.com/" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </Button>
          <Button variant="link" asChild>
            <a
              href="https://electron-vite.org"
              target="_blank"
              rel="noreferrer"
            >
              Documentation
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
