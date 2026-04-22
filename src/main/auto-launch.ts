import { app } from "electron";

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function syncAutoLaunchFromEnv(): boolean {
  const enabled = isTruthyEnvValue(process.env["AI_TRACKER_AUTO_LAUNCH"]);

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
    });
  } catch (error) {
    console.warn("[AutoLaunch] Failed to apply login item settings:", error);
  }

  return enabled;
}
