import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
} from "electron-updater";
import { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setUpdaterWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-not-available");
    }
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-download-progress", {
        bytesPerSecond: progress.bytesPerSecond,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on("update-downloaded", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded");
    }
  });

  autoUpdater.on("error", (error: Error) => {
    console.error("[Updater] Error:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", {
        message: error.message,
      });
    }
  });
}

export async function checkForUpdates(): Promise<{
  ok: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string;
  error?: string;
}> {
  try {
    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo ?? null;
    const available =
      updateInfo !== null &&
      autoUpdater.currentVersion.compare(updateInfo.version) < 0;
    return {
      ok: true,
      available,
      currentVersion: autoUpdater.currentVersion.toString(),
      latestVersion: updateInfo?.version ?? null,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      currentVersion: autoUpdater.currentVersion.toString(),
      latestVersion: null,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function downloadUpdate(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
