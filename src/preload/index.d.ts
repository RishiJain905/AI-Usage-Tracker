import { ElectronAPI } from "@electron-toolkit/preload";

interface ProxyAPI {
  getProxyStatus: () => Promise<{ isRunning: boolean; port: number | null }>;
  getProxyPort: () => Promise<number | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ProxyAPI;
  }
}
