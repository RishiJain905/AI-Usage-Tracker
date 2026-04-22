import {
  app,
  Menu,
  Notification,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface TrayAggregateSummary {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface TrayModelSummary {
  modelId: string;
  modelName: string;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface TrayProxyStatusSummary {
  isRunning: boolean;
  port: number | null;
}

export interface TrayUsageSnapshot {
  today: TrayAggregateSummary;
  topModelsToday: TrayModelSummary[];
  week: TrayAggregateSummary;
  allTime: TrayAggregateSummary;
  proxy: TrayProxyStatusSummary;
}

export interface TrayNotificationOptions {
  title: string;
  body: string;
  icon?: NativeImage;
  silent?: boolean;
}

export interface TrayController {
  update(snapshot: TrayUsageSnapshot): void;
  dispose(): void;
}

export interface CreateTrayControllerOptions {
  onRestoreWindow: () => void | Promise<void>;
  onStartProxy: () => void | Promise<void>;
  onStopProxy: () => void | Promise<void>;
  onShowDashboard?: () => void | Promise<void>;
  onQuit: () => void | Promise<void>;
}

const APP_NAME = "AI Usage Tracker";
const MAX_TOP_MODELS = 3;

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const costFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let notificationIconCache: NativeImage | null = null;

function resolveResourcePath(fileName: string): string {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, "resources", fileName),
        join(process.resourcesPath, "app.asar.unpacked", "resources", fileName),
        join(process.resourcesPath, fileName),
      ]
    : [
        join(app.getAppPath(), "resources", fileName),
        join(process.cwd(), "resources", fileName),
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? fileName;
}

function loadTrayIcon(): NativeImage {
  const fileName =
    process.platform === "darwin"
      ? "tray-icon-template.png"
      : "tray-icon-32.png";
  const image = nativeImage.createFromPath(resolveResourcePath(fileName));

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function loadNotificationIcon(): NativeImage {
  if (notificationIconCache) {
    return notificationIconCache;
  }

  const image = nativeImage.createFromPath(
    resolveResourcePath("notification-icon.png"),
  );

  notificationIconCache = image.isEmpty() ? nativeImage.createEmpty() : image;
  return notificationIconCache;
}

function formatTokens(tokens: number): string {
  return `${compactFormatter.format(tokens)} tokens`;
}

function formatCost(cost: number): string {
  return costFormatter.format(cost);
}

function formatAggregateLabel(
  label: string,
  aggregate: TrayAggregateSummary,
): string {
  return `${label}: ${formatTokens(aggregate.totalTokens)} | ${formatCost(aggregate.totalCost)}`;
}

function formatModelLabel(model: TrayModelSummary, index: number): string {
  const name = model.modelName.trim().length > 0 ? model.modelName : model.modelId;
  return `${index + 1}. ${name} | ${formatTokens(model.totalTokens)} | ${formatCost(model.totalCost)}`;
}

function formatProxyStatus(snapshot: TrayProxyStatusSummary): string {
  if (snapshot.isRunning) {
    const portSuffix = snapshot.port ? ` on port ${snapshot.port}` : "";
    return `Proxy: running${portSuffix}`;
  }

  return "Proxy: stopped";
}

function buildTopModelsMenu(
  topModels: TrayModelSummary[],
): MenuItemConstructorOptions {
  const items = topModels.slice(0, MAX_TOP_MODELS).map((model, index) => ({
    label: formatModelLabel(model, index),
    enabled: false,
  }));

  return {
    label: "Top 3 models today",
    submenu:
      items.length > 0
        ? items
        : [
            {
              label: "No usage today",
              enabled: false,
            },
          ],
  };
}

function runAction(action: () => void | Promise<void>, actionName: string): void {
  void Promise.resolve(action()).catch((error) => {
    console.error(`[Tray] ${actionName} failed:`, error);
  });
}

export function showTrayNotification(options: TrayNotificationOptions): boolean {
  if (!Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title: options.title,
    body: options.body,
    icon: options.icon ?? loadNotificationIcon(),
    silent: options.silent ?? true,
  });

  notification.show();
  return true;
}

function buildContextMenu(
  snapshot: TrayUsageSnapshot,
  options: CreateTrayControllerOptions,
): Menu {
  const showDashboard = options.onShowDashboard ?? options.onRestoreWindow;

  const template: MenuItemConstructorOptions[] = [
    {
      label: formatAggregateLabel("Today", snapshot.today),
      enabled: false,
    },
    buildTopModelsMenu(snapshot.topModelsToday),
    {
      label: formatAggregateLabel("Week", snapshot.week),
      enabled: false,
    },
    {
      label: formatAggregateLabel("All time", snapshot.allTime),
      enabled: false,
    },
    {
      label: formatProxyStatus(snapshot.proxy),
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Start Proxy",
      enabled: !snapshot.proxy.isRunning,
      click: () => runAction(options.onStartProxy, "Start Proxy"),
    },
    {
      label: "Stop Proxy",
      enabled: snapshot.proxy.isRunning,
      click: () => runAction(options.onStopProxy, "Stop Proxy"),
    },
    { type: "separator" },
    {
      label: "Show Dashboard",
      click: () => runAction(showDashboard, "Show Dashboard"),
    },
    {
      label: "Quit",
      click: () => runAction(options.onQuit, "Quit"),
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function createTrayController(
  options: CreateTrayControllerOptions,
): TrayController {
  const tray = new Tray(loadTrayIcon());
  tray.setToolTip(APP_NAME);

  let disposed = false;
  let snapshot: TrayUsageSnapshot = {
    today: { totalTokens: 0, totalCost: 0, requestCount: 0 },
    topModelsToday: [],
    week: { totalTokens: 0, totalCost: 0, requestCount: 0 },
    allTime: { totalTokens: 0, totalCost: 0, requestCount: 0 },
    proxy: { isRunning: false, port: null },
  };

  const rebuild = (): void => {
    if (disposed) {
      return;
    }

    tray.setContextMenu(buildContextMenu(snapshot, options));
  };

  tray.on("click", () => {
    runAction(options.onRestoreWindow, "Restore Window");
  });

  rebuild();

  return {
    update(next: TrayUsageSnapshot): void {
      if (disposed) {
        return;
      }

      snapshot = next;
      rebuild();
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      tray.destroy();
    },
  };
}
