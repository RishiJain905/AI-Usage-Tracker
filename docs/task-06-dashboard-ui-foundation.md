# Task 6: Dashboard UI Foundation

## Objective
Build the React dashboard shell with layout, navigation, theming, and routing. This is the foundation that all dashboard views will plug into.

## Steps

### 6.1 Install shadcn/ui components

Install the core set of shadcn components needed:

```bash
npx shadcn@latest add button card tabs table badge separator sidebar sheet scroll-area dropdown-menu tooltip progress avatar switch label input select dialog
```

### 6.2 Implement app layout with sidebar

File: `src/renderer/src/components/layout/AppLayout.tsx`

Create a persistent layout with:
- **Left sidebar** (collapsible, width 240px expanded / 64px collapsed)
- **Top header bar** with app title, search, and actions
- **Main content area** that renders the current route

```
┌──────────────────────────────────────────────┐
│ ▼ AI Tracker          [Search]    [⚙] [—][□][✕]│
├─────────┬────────────────────────────────────┤
│ Overview│                                    │
│ By Prov │     Main Content Area              │
│ By Model│     (route renders here)            │
│ Cost    │                                    │
│ History │                                    │
│         │                                    │
│ ─────── │                                    │
│ Settings│                                    │
└─────────┴────────────────────────────────────┘
```

### 6.3 Implement sidebar component

File: `src/renderer/src/components/layout/Sidebar.tsx`

- Navigation items with icons (lucide-react):
  - Overview (LayoutDashboard)
  - By Provider (Server)
  - By Model (Cpu) — **primary entry point for per-model tracking**
  - Cost Tracking (DollarSign)
  - Usage History (History)
  - Settings (Settings) — at bottom with separator
- Below the main nav, show a compact **sidebar summary**:
  - Today's total tokens (aggregate across ALL models)
  - This week's total tokens
  - All-time total tokens
  - Top 3 models by usage today (per-model quick view)
- Active state highlighting
- Collapsible to icon-only mode
- Keyboard shortcut hints on hover

### 6.4 Implement header component

File: `src/renderer/src/components/layout/Header.tsx`

- App logo and name: "AI Usage Tracker"
- Proxy status indicator (green dot = running, red = stopped)
- **Quick stats: Today's total tokens (all models) | Today's total cost | Top model today**
- **Period pill tabs in header: Today | This Week | This Month | All Time** — global period selector that affects all views
- Settings gear icon
- Theme toggle (dark/light)

### 6.5 Set up React Router

File: `src/renderer/src/App.tsx`

```tsx
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
```

### 6.6 Implement dark/light theme

File: `src/renderer/src/lib/theme.ts`

- Use `next-themes`-like pattern or custom hook
- Store theme preference in Electron store (persists across restarts)
- Toggle with keyboard shortcut `Ctrl+Shift+D`
- Default to system preference

Apply theme via CSS variables on `:root` and `.dark`:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  /* ... shadcn CSS variables ... */
}
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```

### 6.7 Set up IPC communication layer

File: `src/main/ipc/handlers.ts`

Define IPC channels between main and renderer:

```typescript
// Main → Renderer (events)
'usage-updated'       // Real-time usage update from proxy (includes per-model + aggregate)
'proxy-status'        // Proxy started/stopped
'provider-error'      // Provider connection error

// Renderer → Main (requests) — ALL period-aware
'get-usage-summary'   // Get aggregated usage data for a period
'get-usage-logs'      // Get raw usage logs with filters
'get-daily-summary'   // Get daily aggregated data
'get-weekly-summary'  // Get weekly aggregated data
'get-model-summary'   // Get per-model summary for a period
'get-all-model-summaries' // Get EVERY model's summary for a period
'get-aggregate-total'    // Get total across ALL models for a period
'get-model-breakdown'   // Get per-model token/cost breakdown for a period
'get-providers'       // Get provider list and status
'get-settings'        // Get app settings
'update-settings'     // Update app settings
'test-api-key'        // Test an API key
'toggle-proxy'        // Start/stop the proxy
'export-data'         // Export usage data
```

File: `src/preload/index.ts`

Expose safe IPC methods via context bridge:
```typescript
contextBridge.exposeInMainWorld('api', {
  onUsageUpdated: (callback) => ipcRenderer.on('usage-updated', callback),
  getUsageSummary: (filters) => ipcRenderer.invoke('get-usage-summary', filters),
  // ... all IPC methods
});
```

### 6.8 Implement Zustand stores

File: `src/renderer/src/stores/usageStore.ts`

```typescript
interface UsageState {
  // Current period — CRITICAL: affects ALL views globally
  period: 'today' | 'week' | 'month' | 'all';
  selectedProvider: string | null;
  selectedModel: string | null;

  // Data — AGGREGATE (total across all models)
  summary: UsageSummary | null;            // Aggregate summary for current period
  dailyTrend: DailyTrend[];                // Daily totals across all models
  weeklyTrend: WeeklyTrend[];              // Weekly totals across all models
  providerBreakdown: ProviderBreakdown[];  // Provider-level breakdown (aggregated across models)
  aggregateTotal: AggregateTotal | null;   // Grand total tokens/cost for current period

  // Data — PER-MODEL (each model tracked separately)
  modelBreakdown: ModelBreakdown[];        // Per-model token/cost breakdown for current period
  allModelSummaries: ModelSummary[];       // Every model's individual summary
  modelDailyTrends: Record<string, DailyTrend[]>; // Per-model daily trends

  // Real-time
  isConnected: boolean;
  lastUpdate: Date | null;

  // Actions
  setPeriod: (period: 'today' | 'week' | 'month' | 'all') => void;
  fetchSummary: () => Promise<void>;
  fetchAggregateTotal: () => Promise<void>;
  fetchModelBreakdown: () => Promise<void>;
  fetchAllModelSummaries: () => Promise<void>;
  fetchDailyTrend: (days: number) => Promise<void>;
  fetchWeeklyTrend: (weeks: number) => Promise<void>;
  fetchModelDailyTrend: (modelId: string, days: number) => Promise<void>;
  // ...
}
```

File: `src/renderer/src/stores/settingsStore.ts`

```typescript
interface SettingsState {
  proxyPort: number;
  proxyEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  currency: string;
  providers: ProviderConfig[];
  // ...
}
```

### 6.9 Create type definitions

File: `src/renderer/src/types/usage.ts`

Shared TypeScript interfaces matching the database schema and IPC responses.

File: `src/renderer/src/types/provider.ts`

Provider and model type definitions.

File: `src/renderer/src/types/settings.ts`

Settings type definitions.

### 6.10 Add loading and empty states

Create reusable components:
- `<LoadingSpinner />` — For data loading states
- `<EmptyState />` — When no usage data exists yet
- `<ErrorState />` — For failed data fetches
- `<ProxyOffState />` — When proxy is not running

## Verification
- App launches with sidebar and header
- **Global period selector** (Today / This Week / This Month / All Time) is visible in header and changes affect ALL views
- Navigation between routes works
- Sidebar shows compact summary with aggregate totals AND top 3 models
- Dark/light theme toggle works and persists
- Sidebar collapses to icon-only mode
- IPC communication works between main and renderer — period-aware queries tested
- **Zustand store contains both `aggregateTotal` AND per-model `modelBreakdown`** — verified simultaneously
- Loading states render while data fetches

## Core Tracking Requirements
The UI foundation sets up the dual-view pattern used everywhere:
1. **Global period selector**: The `period` state (`'today' | 'week' | 'month' | 'all'`) in the Zustand store is the single source of truth. Changing it instantly re-queries all data (aggregate AND per-model) for the new period.
2. **Dual data model**: Every view has access to both `aggregateTotal` (sum across all models) and `modelBreakdown`/`allModelSummaries` (per-model). This is baked into the store — no view needs to compute totals manually.
3. **Sidebar quick stats**: Always visible, showing aggregate totals (today/week/all-time) and the top 3 models so users get instant visibility into multi-model usage.

## Dependencies
- Task 1 (Project Scaffolding)

## Estimated Time
4-5 hours
