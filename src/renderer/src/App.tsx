import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import { useSettingsStore } from "@/stores/settingsStore";

function App(): React.JSX.Element {
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTheme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="providers" element={<ByProvider />} />
          <Route path="models" element={<ByModel />} />
          <Route path="cost" element={<CostView />} />
          <Route path="history" element={<UsageHistory />} />
          <Route path="settings" element={<Settings />}>
            <Route index element={<GeneralSettings />} />
            <Route path="providers" element={<ProviderConfig />} />
            <Route path="api-keys" element={<ApiKeyManager />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
