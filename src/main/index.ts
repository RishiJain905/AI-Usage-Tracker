import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { ProxyServer } from "./proxy/server";
import { registerProxyIpcHandlers } from "./ipc/handlers";

let proxyServer: ProxyServer | null = null;

const PROXY_PORT_MIN = 8765;
const PROXY_PORT_MAX = 8775;

/**
 * Try to start the proxy server, cycling through ports 8765–8775
 * on EADDRINUSE. Returns the started server or null on failure.
 */
async function startProxyServer(): Promise<ProxyServer | null> {
  for (let port = PROXY_PORT_MIN; port <= PROXY_PORT_MAX; port++) {
    const server = new ProxyServer({ port });
    try {
      await server.start();
      console.log(`[ProxyServer] Started on port ${server.port}`);
      return server;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EADDRINUSE") {
        console.warn(`[ProxyServer] Port ${port} in use, trying next...`);
        continue;
      }
      console.error("[ProxyServer] Failed to start:", err);
      return null;
    }
  }
  console.error(
    `[ProxyServer] All ports ${PROXY_PORT_MIN}–${PROXY_PORT_MAX} are in use`,
  );
  return null;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.terratch.ai-usage-tracker");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Start the proxy server with graceful degradation
  try {
    proxyServer = await startProxyServer();
    if (proxyServer) {
      registerProxyIpcHandlers(proxyServer);
    }
  } catch (err) {
    console.error("[Main] Proxy server initialization failed:", err);
  }

  // Always create the window, even if proxy failed
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    try {
      await proxyServer?.stop();
    } catch (err) {
      console.error("[Main] Error stopping proxy server:", err);
    }
    app.quit();
  }
});
