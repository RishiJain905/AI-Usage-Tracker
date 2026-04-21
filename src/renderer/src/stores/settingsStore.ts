import { create } from "zustand";
import { setTheme as applyThemeToDom } from "@/lib/theme";
import type {
  AppSettings,
  DateFormat,
  NumberFormat,
  RetentionPeriodDays,
  Theme,
} from "@/types/settings";
import {
  clampBudgetAlertThreshold,
  DEFAULT_SETTINGS,
  isValidBudgetAmount,
  isValidProxyPort,
  SETTINGS_KEY,
} from "@/types/settings";

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
  setProxyAutoStart: (autoStart: boolean) => void;
  toggleProxy: () => Promise<void>;

  // Display
  setCurrency: (currency: string) => void;
  setCompactMode: (compact: boolean) => void;
  setNumberFormat: (format: NumberFormat) => void;
  setDateFormat: (format: DateFormat) => void;

  // Budget
  setMonthlyBudget: (budget: number) => void;
  setBudgetAlertThreshold: (threshold: number) => void;
  setBudgetNotificationsEnabled: (enabled: boolean) => void;

  // Data retention
  setRetentionDays: (days: RetentionPeriodDays) => void;
  setRetentionAutoCleanup: (enabled: boolean) => void;

  // Lifecycle
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type SettingsApi = Window["api"] & {
  getSettings?: () => Promise<AppSettings | string | null>;
  updateSettings?: (settings: AppSettings) => Promise<boolean>;
};

type PartialAppSettings = Partial<AppSettings> & {
  proxy?: Partial<AppSettings["proxy"]>;
  display?: Partial<AppSettings["display"]>;
  budget?: Partial<AppSettings["budget"]>;
  dataRetention?: Partial<AppSettings["dataRetention"]>;
};

const localStorageKey = SETTINGS_KEY;

function getApi(): SettingsApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.api as SettingsApi;
}

function mergeWithDefaults(value: PartialAppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    proxy: {
      ...DEFAULT_SETTINGS.proxy,
      ...(value.proxy ?? {}),
    },
    display: {
      ...DEFAULT_SETTINGS.display,
      ...(value.display ?? {}),
    },
    providers: Array.isArray(value.providers)
      ? value.providers
      : DEFAULT_SETTINGS.providers,
    budget: {
      ...DEFAULT_SETTINGS.budget,
      ...(value.budget ?? {}),
    },
    dataRetention: {
      ...DEFAULT_SETTINGS.dataRetention,
      ...(value.dataRetention ?? {}),
    },
  };
}

function parseSettingsPayload(
  payload: AppSettings | string | null,
): AppSettings | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    try {
      return mergeWithDefaults(JSON.parse(payload) as PartialAppSettings);
    } catch {
      return null;
    }
  }

  return mergeWithDefaults(payload as PartialAppSettings);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoading: false,
  error: null,

  // Theme
  setTheme: (theme: Theme) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        display: { ...state.settings.display, theme },
      },
    }));
    applyThemeToDom(theme);
    void get().saveSettings();
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
    if (!isValidProxyPort(port)) {
      set({
        error: "Proxy port must be an integer between 1024 and 65535.",
      });
      return;
    }

    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        proxy: { ...state.settings.proxy, port },
      },
    }));
    void get().saveSettings();
  },

  setProxyEnabled: (enabled: boolean) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        proxy: { ...state.settings.proxy, enabled },
      },
    }));
    void get().saveSettings();
  },

  setProxyAutoStart: (autoStart: boolean) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        proxy: { ...state.settings.proxy, autoStart },
      },
    }));
    void get().saveSettings();
  },

  toggleProxy: async () => {
    const api = getApi();
    if (!api) return;

    try {
      const isRunning = await api.toggleProxy();
      set((state) => ({
        error: null,
        settings: {
          ...state.settings,
          proxy: { ...state.settings.proxy, enabled: isRunning },
        },
      }));
      void get().saveSettings();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // Display
  setCurrency: (currency: string) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        display: { ...state.settings.display, currency },
      },
    }));
    void get().saveSettings();
  },

  setCompactMode: (compact: boolean) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        display: { ...state.settings.display, compactMode: compact },
      },
    }));
    void get().saveSettings();
  },

  setNumberFormat: (format: NumberFormat) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        display: { ...state.settings.display, numberFormat: format },
      },
    }));
    void get().saveSettings();
  },

  setDateFormat: (format: DateFormat) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        display: { ...state.settings.display, dateFormat: format },
      },
    }));
    void get().saveSettings();
  },

  // Budget
  setMonthlyBudget: (budget: number) => {
    if (!isValidBudgetAmount(budget)) {
      set({ error: "Budget must be a non-negative number." });
      return;
    }

    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        budget: { ...state.settings.budget, monthlyBudget: budget },
      },
    }));
    void get().saveSettings();
  },

  setBudgetAlertThreshold: (threshold: number) => {
    const clampedThreshold = clampBudgetAlertThreshold(threshold);
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        budget: {
          ...state.settings.budget,
          alertThreshold: clampedThreshold,
        },
      },
    }));
    void get().saveSettings();
  },

  setBudgetNotificationsEnabled: (enabled: boolean) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        budget: {
          ...state.settings.budget,
          notificationsEnabled: enabled,
        },
      },
    }));
    void get().saveSettings();
  },

  // Data retention
  setRetentionDays: (days: RetentionPeriodDays) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        dataRetention: {
          ...state.settings.dataRetention,
          retentionDays: days,
        },
      },
    }));
    void get().saveSettings();
  },

  setRetentionAutoCleanup: (enabled: boolean) => {
    set((state) => ({
      error: null,
      settings: {
        ...state.settings,
        dataRetention: {
          ...state.settings.dataRetention,
          autoCleanup: enabled,
        },
      },
    }));
    void get().saveSettings();
  },

  // Lifecycle
  loadSettings: async () => {
    set({ isLoading: true, error: null });

    try {
      const api = getApi();
      let loadedSettings: AppSettings | null = null;

      if (api?.getSettings) {
        const payload = await api.getSettings();
        loadedSettings = parseSettingsPayload(payload);
      }

      if (!loadedSettings && api?.dbGetSetting) {
        const stored = await api.dbGetSetting(SETTINGS_KEY);
        loadedSettings = parseSettingsPayload(stored);
      }

      if (!loadedSettings && typeof window !== "undefined") {
        const localValue = window.localStorage.getItem(localStorageKey);
        loadedSettings = parseSettingsPayload(localValue);
      }

      const settings = loadedSettings ?? { ...DEFAULT_SETTINGS };
      set({ settings });
      applyThemeToDom(settings.display.theme);
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  saveSettings: async () => {
    const { settings } = get();
    const payload = JSON.stringify(settings);

    try {
      const api = getApi();
      let persisted = false;

      if (api?.updateSettings) {
        try {
          persisted = await api.updateSettings(settings);
        } catch {
          persisted = false;
        }
      }

      if (!persisted && api?.dbSetSetting) {
        await api.dbSetSetting(SETTINGS_KEY, payload);
        persisted = true;
      }

      if (!persisted && typeof window !== "undefined") {
        window.localStorage.setItem(localStorageKey, payload);
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set({
      settings: { ...DEFAULT_SETTINGS },
      isLoading: false,
      error: null,
    });
    applyThemeToDom(DEFAULT_SETTINGS.display.theme);
    void get().saveSettings();
  },
}));
