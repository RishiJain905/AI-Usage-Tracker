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
  ProviderDetail,
  ProxyStatus,
  UsageLog,
  DailySummary,
  UsageFilters,
} from "@/types/usage";
import type { ModelInfo } from "@/types/provider";

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

  // Data — MODELS & PROVIDER DETAIL
  models: ModelInfo[];
  providerDetail: Record<string, ProviderDetail>;

  // Data — USAGE LOGS & DAILY SUMMARIES
  usageLogs: UsageLog[];
  dailySummaries: DailySummary[];

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
  fetchModels: () => Promise<void>;
  fetchProviderDetail: (providerId: string) => Promise<void>;
  fetchUsageLogs: (filters: UsageFilters) => Promise<void>;
  fetchDailySummaries: () => Promise<void>;
  fetchAll: () => Promise<void>;
  setupEventListeners: () => () => void;
  reset: () => void;
}

const api = typeof window !== "undefined" ? window.api : null;

const TREND_WINDOWS: Record<Period, { days: number; weeks: number }> = {
  today: { days: 1, weeks: 1 },
  week: { days: 7, weeks: 1 },
  month: { days: 30, weeks: 4 },
  all: { days: 365, weeks: 52 },
};

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

  models: [],
  providerDetail: {},

  usageLogs: [],
  dailySummaries: [],

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

  fetchDailyTrend: async (days?: number) => {
    if (!api) return;
    try {
      const resolvedDays = days ?? TREND_WINDOWS[get().period].days;
      const dailyTrend = await api.dbGetUsageTrend(resolvedDays);
      set({ dailyTrend });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchWeeklyTrend: async (weeks?: number) => {
    if (!api) return;
    try {
      const resolvedWeeks = weeks ?? TREND_WINDOWS[get().period].weeks;
      const weeklyTrend = await api.dbGetWeeklyTrend(resolvedWeeks);
      set({ weeklyTrend });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchModelDailyTrend: async (modelId: string, days?: number) => {
    if (!api) return;
    try {
      const resolvedDays = days ?? TREND_WINDOWS[get().period].days;
      const trend = await api.dbGetModelUsageTrend(modelId, resolvedDays);
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

  fetchModels: async () => {
    if (!api) return;
    try {
      const rows = await api.dbGetModels();
      const models: ModelInfo[] = (rows ?? []).map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        name: row.name,
        inputPricePerMillion: row.input_price_per_million,
        outputPricePerMillion: row.output_price_per_million,
        isLocal: row.is_local === 1,
      }));
      set({ models });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchProviderDetail: async (providerId: string) => {
    if (!api) return;
    try {
      const summary = await api.dbGetProviderSummary(providerId, get().period);
      const allModels = get().allModelSummaries;
      const providerModels = allModels.filter(
        (m) => m.provider_id === providerId,
      );

      const errorRate = 0;
      const avgLatencyMs = 0;

      const detail: ProviderDetail = {
        ...summary,
        models: providerModels,
        avgLatencyMs,
        errorRate,
      };
      set((state) => ({
        providerDetail: { ...state.providerDetail, [providerId]: detail },
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchUsageLogs: async (filters: UsageFilters) => {
    if (!api) return;
    try {
      const usageLogs = await api.dbGetUsageLogs(filters);
      set({ usageLogs });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  fetchDailySummaries: async () => {
    if (!api) return;
    try {
      const period = get().period;
      const now = new Date();
      let start: string;
      let end: string;

      switch (period) {
        case "today": {
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, "0");
          const d = String(now.getDate()).padStart(2, "0");
          start = `${y}-${m}-${d}`;
          end = start;
          break;
        }
        case "week": {
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const monday = new Date(now);
          monday.setDate(now.getDate() + mondayOffset);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          start = monday.toISOString().slice(0, 10);
          end = sunday.toISOString().slice(0, 10);
          break;
        }
        case "month": {
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, "0");
          start = `${y}-${m}-01`;
          const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
          end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
          break;
        }
        case "all":
          start = "0001-01-01";
          end = "9999-12-31";
          break;
      }

      const dailySummaries = await api.dbGetDailySummary(start, end);
      set({ dailySummaries });
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
      fetchModels,
      fetchUsageLogs,
      fetchDailySummaries,
      fetchModelDailyTrend,
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
        fetchModels(),
        fetchUsageLogs({ limit: 50, offset: 0 }),
        fetchDailySummaries(),
      ]);

      const topModelIds = get()
        .allModelSummaries.slice(0, 10)
        .map((summary) => summary.model_id);
      await Promise.all(topModelIds.map((modelId) => fetchModelDailyTrend(modelId)));
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
      models: [],
      providerDetail: {},
      usageLogs: [],
      dailySummaries: [],
      proxyStatus: null,
      lastUpdate: null,
      isLoading: false,
      error: null,
    });
  },
}));
