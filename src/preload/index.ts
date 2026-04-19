import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  getProxyStatus: (): Promise<{ isRunning: boolean; port: number | null }> =>
    ipcRenderer.invoke("proxy:get-status"),

  getProxyPort: (): Promise<number | null> =>
    ipcRenderer.invoke("proxy:get-port"),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
