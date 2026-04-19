# Task 7: Overview & Summary Dashboard

## Objective
Build the main overview page — the first thing users see. It should show key metrics at a glance with charts and quick navigation to detailed views.

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Overview               Today | This Week | All Time  │
├──────────┬──────────┬──────────┬──────────────────────┤
│ TOTAL    │ Total    │ Total    │ Active               │
│ TOKENS   │ Cost     │ Requests │ Providers            │
│ (ALL)    │          │          │                      │
│ 1.2M     │ $24.50   │ 342      │ 5                    │
│ ↑ 12%    │ ↑ 8%     │ ↑ 15%    │ OpenAI, Claude...    │
│          │          │          │                      │
│ = Sum of ALL models combined                      │
├──────────┴──────────┴──────────┴──────────────────────┤
│                                                       │
│  Per-Model Breakdown (Today)                          │
│  ┌──────────────────────────────────────────────────┐│
│  │ GPT-4o       ████████░░  320K tok  $9.00  65%   ││
│  │ Claude 3.5   ██████░░░░  240K tok  $7.00  25%   ││
│  │ Llama 3.1    ████░░░░░░  100K tok  Free   10%   ││
│  │ GPT-4o Mini  ██░░░░░░░░   40K tok  $2.00   3%   ││
│  │ ─────────────────────────────────────────────── ││
│  │ TOTAL:       1.2M tok           $24.50  100%    ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Token Usage Over Time (AGGREGATE — all models)       │
│  ┌─────────────────────────────────────────────┐     │
│  │          ╱╲    ╱╲                           │     │
│  │    ╱╲   ╱  ╲  ╱  ╲   ╱╲                    │     │
│  │   ╱  ╲ ╱    ╲╱    ╲ ╱  ╲   ╱╲             │     │
│  │  ╱    ╲            ╲╱    ╲ ╱  ╲            │     │
│  └─────────────────────────────────────────────┘     │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                    │
│                                                       │
│  Toggle: [Aggregate] [Per-Model Stacked]              │
│                                                       │
├─────────────────────┬────────────────────────────────┤
│ Tokens by Provider  │ Cost by Provider               │
│ (Aggregate totals)  │ (Aggregate totals)             │
│ ┌─────────────────┐ │ ┌────────────────────────────┐ │
│ │ OpenAI  45%     │ │ │ OpenAI          $12.50      │ │
│ │ Claude  30%     │ │ │ Anthropic       $8.00       │ │
│ │ Ollama  15%     │ │ │ Ollama          $0.00       │ │
│ │ Gemini  10%     │ │ │ Gemini          $4.00       │ │
│ └─────────────────┘ │ └────────────────────────────┘ │
├─────────────────────┴────────────────────────────────┤
│ Recent Activity (with model column)                  │
│ ┌──────────────────────────────────────────────────┐ │
│ │ GPT-4o     OpenAI   1,250 tok   $0.02  2 min ago│ │
│ │ Claude 3.5 Anthropic 890 tok    $0.01  5 min ago│ │
│ │ Llama 3.1  Ollama   2,100 tok   Free   8 min ago│ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Steps

### 7.1 Build metric cards component

File: `src/renderer/src/components/dashboard/MetricCard.tsx`

Interactive metric cards showing:
- Value (large number)
- Label
- Trend indicator (up/down with percentage vs previous period)
- Icon and color coding
- Click to navigate to detail view

**First card is the AGGREGATE TOTAL across all models:**
```tsx
// AGGREGATE — sum of ALL models for the selected period
<MetricCard
  title="Total Tokens (All Models)"
  value="1.2M"
  subtitle="GPT-4o + Claude 3.5 + Llama 3.1 + ..."
  trend={{ direction: 'up', percentage: 12 }}
  icon={<Zap />}
  onClick={() => navigate('/history')}
/>
```

### 7.2 Build usage timeline chart

File: `src/renderer/src/components/charts/UsageTimeline.tsx`

Line/area chart using Recharts:
- X-axis: dates (last 7/14/30 days based on period)
- Y-axis: token count
- **Two modes — toggle between:**
  1. **Aggregate mode**: Single line showing total tokens across ALL models combined per day
  2. **Per-model stacked mode**: Stacked area with one layer per model (color-coded)
- Tooltips showing exact values (per-model breakdown in aggregate mode, individual model in stacked mode)
- Click on a point to see that day's details
- Default: Aggregate mode (per-model stacked on toggle)

### 7.3 Build provider breakdown charts

File: `src/renderer/src/components/charts/ProviderBreakdown.tsx`

Two side-by-side visualizations:

**Left — Donut chart** (token share by provider):
- Each provider gets a distinct color
- Center shows total token count
- Click segment → navigate to provider detail page

**Right — Horizontal bar chart** (cost by provider):
- Sorted by cost descending
- Show dollar amounts on bars
- Color matches the donut chart
- Click bar → navigate to provider detail page

### 7.4 Build recent activity feed

File: `src/renderer/src/components/dashboard/RecentActivity.tsx`

Live-updating list of recent API calls:
- Model name with provider badge
- Token count (formatted: 1.2K, 1.2M)
- Cost (formatted: $0.02, Free)
- Relative timestamp (2 min ago, 1 hour ago)
- Status indicator (success/error)
- Auto-scrolls as new entries arrive
- Click row → expand to see full request details

### 7.5 Build period selector

File: `src/renderer/src/components/dashboard/PeriodSelector.tsx`

Toggle buttons for: **Today | This Week | This Month | All Time**
- Updates all dashboard components when changed (both aggregate AND per-model views)
- Persists selected period in settings
- Custom date range picker (optional, can be v2)
- **"Today"** = aggregate/per-model stats for today only
- **"This Week"** = aggregate/per-model stats for current calendar week (Mon-Sun)
- **"This Month"** = aggregate/per-model stats for current calendar month
- **"All Time"** = aggregate/per-model stats since first usage

### 7.6 Build per-model breakdown bar

File: `src/renderer/src/components/dashboard/ModelBreakdownBar.tsx`

A horizontal stacked bar showing each model's share of total tokens:
- Each segment is color-coded per model
- Shows model name, token count, cost, and percentage
- **Total row at bottom** showing aggregate sum across all models
- Click a model → navigate to that model's detail view
- Sorted by token count descending

This component directly addresses the requirement: "total tokens for all models, but each model tracked separately too."

### 7.7 Implement the overview page

File: `src/renderer/src/components/dashboard/Overview.tsx`

Compose all components:

```tsx
function Overview() {
  const { period, setPeriod, aggregateTotal, modelBreakdown, dailyTrend, fetchSummary, fetchAggregateTotal, fetchModelBreakdown } = useUsageStore();

  useEffect(() => {
    fetchSummary();
    fetchAggregateTotal();
    fetchModelBreakdown();
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1>Overview</h1>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* AGGREGATE metric cards — total across ALL models */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard title="Total Tokens (All Models)" value={aggregateTotal.totalTokens} ... />
        <MetricCard title="Total Cost" value={aggregateTotal.totalCost} ... />
        <MetricCard title="Total Requests" value={aggregateTotal.requestCount} ... />
        <MetricCard title="Active Providers" ... />
      </div>

      {/* PER-MODEL breakdown — each model tracked separately */}
      <Card>
        <ModelBreakdownBar models={modelBreakdown} period={period} />
      </Card>

      {/* Timeline — toggle between aggregate and per-model stacked */}
      <Card>
        <UsageTimeline data={dailyTrend} modelTrends={modelDailyTrends} />
      </Card>

      {/* Provider breakdown charts (aggregated across models) */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <ProviderBreakdown type="tokens" data={summary.providerBreakdown} />
        </Card>
        <Card>
          <ProviderBreakdown type="cost" data={summary.providerBreakdown} />
        </Card>
      </div>

      {/* Recent activity — includes model column */}
      <Card>
        <RecentActivity logs={summary.recentLogs} />
      </Card>
    </div>
  );
}
```

### 7.8 Add real-time updates

Connect the overview to IPC events so it updates live:
- On `usage-updated` event → refresh aggregate total AND per-model breakdown
- On `proxy-status` event → show/hide proxy status banner
- Debounce updates (don't refresh on every single request, batch every 2s)
- New request events auto-increment the model's count in the breakdown bar

### 7.9 Add number formatting utilities

File: `src/renderer/src/lib/format.ts`

```typescript
// Format token counts: 1_234 → 1.2K, 1_234_567 → 1.2M
formatTokens(n: number): string;

// Format costs: 0.0234 → $0.02, 12.50 → $12.50
formatCost(n: number): string;

// Format relative time: 2 minutes ago, 3 hours ago
formatRelativeTime(date: string): string;

// Format percentages: 12.3 → "12.3%"
formatPercentage(n: number): string;
```

## Verification
- Overview page renders with all components
- **Metric cards show AGGREGATE total across ALL models** (e.g., "1.2M tokens" = sum of GPT-4o + Claude 3.5 + Llama 3.1 + ...)
- **Per-model breakdown bar shows each model separately** with the aggregate total at the bottom
- Timeline chart has **two modes**: aggregate (total line) and per-model stacked (toggle between)
- Provider breakdown charts show correct proportions
- Recent activity feed updates in real-time and **includes the model column**
- **Period selector: Today / This Week / This Month / All Time** — switching updates everything
- Number formatting is consistent throughout
- Empty state shown when no data exists
- Navigation to detail pages works from all interactive elements

## Dependencies
- Task 4 (SQLite Schema & Data Layer)
- Task 5 (Token Extraction & Cost Engine)
- Task 6 (Dashboard UI Foundation)

## Estimated Time
4-5 hours
