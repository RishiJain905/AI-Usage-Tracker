import { create } from "zustand";
import type {
  Period,
  UsageSummary,
  AggregateTotal,
  ModelBreakdown,
  ModelUsage,
  DailyTrend,
  WeeklyTrend,
  ProviderSummary,
  ProxyStatus,
} from "@/types/usage";

interface UsageState {
  // Current period — CRITICAL: global state affecting ALL views
  period: Period;
  selectedProvider: string | null;
  selectedModel: string | null;

  // Data — AGGREGATE (total across all models)
  summary: UsageSummary | null;
  dailyTrend: DailyTrend[];
  weeklyTrend: WeeklyTrend[];
  providerBreakdown: ProviderSummary[];
  aggregateTotal: AggregateTotal | null;

  // Data — PER-MODEL (each model tracked separately)
  modelBreakdown: ModelBreakdown[];
  allModelSummaries: ModelBreakdown[];
  modelDailyTrends: Record<string, DailyTrend[]>;
  topModels: ModelUsage[];

  // Real-time
  proxyStatus: ProxyStatus | null;
  lastUpdate: Date | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPeriod: (period: Period) => void;
  setSelectedProvider: (providerId: string | null) => void;
  setSelectedModel: (modelId: string | null) => void;
  fetchSummary: () => Promise<void>;
  fetchAggregateTotal: () => Promise<void>;
  fetchModelBreakdown: () => Promise<void>;
  fetchAllModelSummaries: () => Promise<void>;
  fetchTopModels: (limit?: number) => Promise<void>;
  fetchDailyTrend: (days?: number) => Promise<void>;
  fetchWeeklyTrend: (weeks?: number) => Promise<void>;
  fetchModelDailyTrend: (modelId: string, days?: number) => Promise<void>;
  fetchProxyStatus: () => Promise<void>;
  fetchAll: () => Promise<void>;
  setupEventListeners: () => () => void;
  reset: () => void;
}

const api = typeof window !== "undefined" ? window.api : null;

export const useUsageStore = create<UsageState>((set, get) => ({
  // State
  period: "today",
  selectedProvider: null,
  selectedModel: null,

  summary: null,
  dailyTrend: [],
  weeklyTrend: [],
  providerBreakdown: [],
  aggregateTotal: null,

  modelBreakdown: [],
  allModelSummaries: [],
  modelDailyTrends: {},
  topModels: [],

  proxyStatus: null,
  lastUpdate: null,
  isLoading: false,
  error: null,

  // Actions
  setPeriod: (period: Period) => {
    set({ period });
    get().fetchAll();
  },

  setSelectedProvider: (providerId: string | null) => {
    set({ selectedProvider: providerId });
  },

  setSelectedModel: (modelId: string | null) => {
    set({ selectedModel: modelId });
  },

  fetchSummary: async () => {
    if (!api) return;
    try {
      const summary = await api.dbGetUsageSummary(get().period);
      set({ summary });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchAggregateTotal: async () => {
    if (!api) return;
    try {
      const aggregateTotal = await api.dbGetAggregateTotal(get().period);
      set({ aggregateTotal });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchModelBreakdown: async () => {
    if (!api) return;
    try {
      const modelBreakdown = await api.dbGetModelBreakdown(get().period);
      set({ modelBreakdown });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchAllModelSummaries: async () => {
    if (!api) return;
    try {
      const allModelSummaries = await api.dbGetAllModelSummaries(get().period);
      set({ allModelSummaries });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchTopModels: async (limit = 10) => {
    if (!api) return;
    try {
      const topModels = await api.dbGetTopModels(limit, get().period);
      set({ topModels });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchDailyTrend: async (days = 30) => {
    if (!api) return;
    try {
      const dailyTrend = await api.dbGetUsageTrend(days);
      set({ dailyTrend });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchWeeklyTrend: async (weeks = 12) => {
    if (!api) return;
    try {
      const weeklyTrend = await api.dbGetWeeklyTrend(weeks);
      set({ weeklyTrend });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchModelDailyTrend: async (modelId: string, days = 30) => {
    if (!api) return;
    try {
      // Fetch all daily summaries and filter by model
      // The API doesn't have a direct model-daily-trend method,
      // so we fetch daily trend data and store it keyed by modelId
      const trend = await api.dbGetUsageTrend(days);
      set((state) => ({
        modelDailyTrends: {
          ...state.modelDailyTrends,
          [modelId]: trend,
        },
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchProxyStatus: async () => {
    if (!api) return;
    try {
      const proxyStatus = await api.getProxyStatus();
      set({ proxyStatus });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchAll: async () => {
    const {
      fetchSummary,
      fetchAggregateTotal,
      fetchModelBreakdown,
      fetchAllModelSummaries,
      fetchTopModels,
      fetchDailyTrend,
      fetchWeeklyTrend,
      fetchProxyStatus,
    } = get();
    set({ isLoading: true, error: null });
    try {
      await Promise.all([
        fetchSummary(),
        fetchAggregateTotal(),
        fetchModelBreakdown(),
        fetchAllModelSummaries(),
        fetchTopModels(),
        fetchDailyTrend(),
        fetchWeeklyTrend(),
        fetchProxyStatus(),
      ]);
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isLoading: false, lastUpdate: new Date() });
    }
  },

  setupEventListeners: () => {
    if (!api) return () => {};

    const unsubUsage = api.onUsageUpdated(() => {
      get().fetchAll();
    });

    const unsubProxy = api.onProxyStatus((status) => {
      set({ proxyStatus: status });
    });

    const unsubError = api.onProviderError((error) => {
      set({ error: `Provider ${error.providerId}: ${error.message}` });
    });

    return () => {
      unsubUsage();
      unsubProxy();
      unsubError();
    };
  },

  reset: () => {
    set({
      period: "today",
      selectedProvider: null,
      selectedModel: null,
      summary: null,
      dailyTrend: [],
      weeklyTrend: [],
      providerBreakdown: [],
      aggregateTotal: null,
      modelBreakdown: [],
      allModelSummaries: [],
      modelDailyTrends: {},
      topModels: [],
      proxyStatus: null,
      lastUpdate: null,
      isLoading: false,
      error: null,
    });
  },
}));
