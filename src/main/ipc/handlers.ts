import { ipcMain } from "electron";
import type { ProxyServer } from "../proxy/server";
import type { ProxyStatus } from "../proxy/types";

let proxyServer: ProxyServer | null = null;

/**
 * Register IPC handlers for proxy server communication.
 * Called from index.ts after the proxy server instance is created.
 */
export function registerProxyIpcHandlers(server: ProxyServer): void {
  proxyServer = server;

  ipcMain.handle(
    "proxy:get-status",
    (): ProxyStatus => ({
      isRunning: proxyServer?.isRunning ?? false,
      port: proxyServer?.port ?? null,
    }),
  );

  ipcMain.handle(
    "proxy:get-port",
    (): number | null => proxyServer?.port ?? null,
  );
}
