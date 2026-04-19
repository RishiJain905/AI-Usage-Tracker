import { create } from "zustand";
import type { Theme, AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { setTheme as applyThemeToDom } from "@/lib/theme";

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Theme
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Proxy
  setProxyPort: (port: number) => void;
  setProxyEnabled: (enabled: boolean) => void;
  toggleProxy: () => Promise<void>;

  // Display
  setCurrency: (currency: string) => void;
  setCompactMode: (compact: boolean) => void;

  // Lifecycle
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  reset: () => void;
}

const api = typeof window !== "undefined" ? window.api : null;

const SETTINGS_KEY = "app_settings";

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoading: false,
  error: null,

  // Theme
  setTheme: (theme: Theme) => {
    set((state) => ({
      settings: {
        ...state.settings,
        display: { ...state.settings.display, theme },
      },
    }));
    applyThemeToDom(theme);
    get().saveSettings();
  },

  toggleTheme: () => {
    const { settings } = get();
    const themes: Theme[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(settings.display.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    get().setTheme(nextTheme);
  },

  // Proxy
  setProxyPort: (port: number) => {
    set((state) => ({
      settings: {
        ...state.settings,
        proxy: { ...state.settings.proxy, port },
      },
    }));
    get().saveSettings();
  },

  setProxyEnabled: (enabled: boolean) => {
    set((state) => ({
      settings: {
        ...state.settings,
        proxy: { ...state.settings.proxy, enabled },
      },
    }));
    get().saveSettings();
  },

  toggleProxy: async () => {
    if (!api) return;
    try {
      const isRunning = await api.toggleProxy();
      set((state) => ({
        settings: {
          ...state.settings,
          proxy: { ...state.settings.proxy, enabled: isRunning },
        },
      }));
      get().saveSettings();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // Display
  setCurrency: (currency: string) => {
    set((state) => ({
      settings: {
        ...state.settings,
        display: { ...state.settings.display, currency },
      },
    }));
    get().saveSettings();
  },

  setCompactMode: (compact: boolean) => {
    set((state) => ({
      settings: {
        ...state.settings,
        display: { ...state.settings.display, compactMode: compact },
      },
    }));
    get().saveSettings();
  },

  // Lifecycle
  loadSettings: async () => {
    if (!api) return;
    set({ isLoading: true, error: null });
    try {
      const stored = await api.dbGetSetting(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppSettings;
        set({ settings: { ...DEFAULT_SETTINGS, ...parsed } });
        // Apply theme from loaded settings
        applyThemeToDom(
          parsed.display?.theme ?? DEFAULT_SETTINGS.display.theme,
        );
      }
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  saveSettings: async () => {
    if (!api) return;
    try {
      const { settings } = get();
      await api.dbSetSetting(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  reset: () => {
    set({
      settings: { ...DEFAULT_SETTINGS },
      isLoading: false,
      error: null,
    });
    applyThemeToDom(DEFAULT_SETTINGS.display.theme);
  },
}));
