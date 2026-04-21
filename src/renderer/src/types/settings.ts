import type { ProviderId } from "./provider";

export type Theme = "light" | "dark" | "system";
export type NumberFormat = "comma" | "dot" | "space";
export type DateFormat = "mdy" | "dmy";
export type RetentionPeriodDays = 0 | 30 | 60 | 90 | 180 | 365;

export interface ProxySettings {
  port: number;
  enabled: boolean;
  autoStart: boolean;
}

export interface DisplaySettings {
  theme: Theme;
  currency: string;
  compactMode: boolean;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
}

export interface BudgetSettings {
  monthlyBudget: number; // 0 = disabled/hidden
  alertThreshold: number;
  notificationsEnabled: boolean;
}

export interface DataRetentionSettings {
  retentionDays: RetentionPeriodDays;
  autoCleanup: boolean;
}

export interface AppSettings {
  proxy: ProxySettings;
  display: DisplaySettings;
  providers: ProviderConfigEntry[];
  budget: BudgetSettings;
  dataRetention: DataRetentionSettings;
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
    numberFormat: "comma",
    dateFormat: "mdy",
  },
  providers: [],
  budget: {
    monthlyBudget: 0,
    alertThreshold: 80,
    notificationsEnabled: true,
  },
  dataRetention: {
    retentionDays: 90,
    autoCleanup: true,
  },
};

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "JPY", label: "JPY" },
  { value: "CNY", label: "CNY" },
] as const;

export const NUMBER_FORMAT_OPTIONS = [
  { value: "comma", label: "1,234.56" },
  { value: "dot", label: "1.234,56" },
  { value: "space", label: "1 234.56" },
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "mdy", label: "MM/DD/YYYY" },
  { value: "dmy", label: "DD/MM/YYYY" },
] as const;

export const RETENTION_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "365 days" },
  { value: 0, label: "Forever" },
] as const;

export const SETTINGS_KEY = "app_settings";
export const PROXY_PORT_MIN = 1024;
export const PROXY_PORT_MAX = 65535;
export const BUDGET_ALERT_MIN = 50;
export const BUDGET_ALERT_MAX = 100;

export function isValidProxyPort(port: number): boolean {
  return (
    Number.isInteger(port) && port >= PROXY_PORT_MIN && port <= PROXY_PORT_MAX
  );
}

export function isValidBudgetAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function clampBudgetAlertThreshold(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_SETTINGS.budget.alertThreshold;
  }
  return Math.min(BUDGET_ALERT_MAX, Math.max(BUDGET_ALERT_MIN, value));
}
