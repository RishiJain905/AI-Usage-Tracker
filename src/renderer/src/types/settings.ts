import type { ProviderId } from "./provider";

export type Theme = "light" | "dark" | "system";

export interface ProxySettings {
  port: number;
  enabled: boolean;
  autoStart: boolean;
}

export interface DisplaySettings {
  theme: Theme;
  currency: string;
  compactMode: boolean;
}

export interface BudgetSettings {
  monthlyBudget: number; // 0 = disabled/hidden
}

export interface AppSettings {
  proxy: ProxySettings;
  display: DisplaySettings;
  providers: ProviderConfigEntry[];
  budget: BudgetSettings;
}

export interface ProviderConfigEntry {
  id: ProviderId;
  name: string;
  baseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  proxy: {
    port: 8765,
    enabled: true,
    autoStart: true,
  },
  display: {
    theme: "system",
    currency: "USD",
    compactMode: false,
  },
  providers: [],
  budget: { monthlyBudget: 0 },
};

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "JPY", label: "JPY (¥)" },
  { value: "CNY", label: "CNY (¥)" },
] as const;
