import { useCallback, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import Overview from "@/components/dashboard/Overview";
import ByProvider from "@/components/dashboard/ByProvider";
import ByModel from "@/components/dashboard/ByModel";
import CostView from "@/components/dashboard/CostView";
import UsageHistory from "@/components/dashboard/UsageHistory";
import Settings from "@/components/settings/Settings";
import GeneralSettings from "@/components/settings/GeneralSettings";
import ProviderConfig from "@/components/settings/ProviderConfig";
import ApiKeyManager from "@/components/settings/ApiKeyManager";
import About from "@/components/settings/About";
import DataManagement from "@/components/settings/DataManagement";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUsageStore } from "@/stores/usageStore";

type AppCommand =
  | "navigate-overview"
  | "navigate-providers"
  | "navigate-models"
  | "navigate-cost"
  | "navigate-history"
  | "navigate-settings"
  | "refresh"
  | "focus-history-search";

function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell(): React.JSX.Element {
  const navigate = useNavigate();
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const fetchAll = useUsageStore((s) => s.fetchAll);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const focusHistorySearch = useCallback(() => {
    navigate("/history", { state: { focusSearch: true } });
  }, [navigate]);

  const executeAppCommand = useCallback(
    (command: AppCommand): void => {
      switch (command) {
        case "navigate-overview":
          navigate("/");
          return;
        case "navigate-providers":
          navigate("/providers");
          return;
        case "navigate-models":
          navigate("/models");
          return;
        case "navigate-cost":
          navigate("/cost");
          return;
        case "navigate-history":
          navigate("/history");
          return;
        case "navigate-settings":
          navigate("/settings");
          return;
        case "refresh":
          void fetchAll();
          return;
        case "focus-history-search":
          focusHistorySearch();
          return;
      }
    },
    [fetchAll, focusHistorySearch, navigate],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleTheme();
        return;
      }

      const hasCommandModifier = e.metaKey || e.ctrlKey;
      if (!hasCommandModifier || e.altKey || e.shiftKey) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "1":
          e.preventDefault();
          executeAppCommand("navigate-overview");
          return;
        case "2":
          e.preventDefault();
          executeAppCommand("navigate-providers");
          return;
        case "3":
          e.preventDefault();
          executeAppCommand("navigate-models");
          return;
        case "4":
          e.preventDefault();
          executeAppCommand("navigate-cost");
          return;
        case "5":
          e.preventDefault();
          executeAppCommand("navigate-history");
          return;
        case ",":
          e.preventDefault();
          executeAppCommand("navigate-settings");
          return;
        case "r":
          e.preventDefault();
          executeAppCommand("refresh");
          return;
        case "f":
          e.preventDefault();
          executeAppCommand("focus-history-search");
          return;
        default:
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executeAppCommand, toggleTheme]);

  useEffect(() => {
    return window.api?.onAppCommand?.(executeAppCommand);
  }, [executeAppCommand]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Overview />} />
        <Route path="providers" element={<ByProvider />} />
        <Route path="models" element={<ByModel />} />
        <Route path="cost" element={<CostView />} />
        <Route path="history" element={<UsageHistory />} />
        <Route path="settings" element={<Settings />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="providers" element={<ProviderConfig />} />
          <Route path="api-keys" element={<ApiKeyManager />} />
          <Route path="about" element={<About />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="*" element={<Navigate to="general" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
