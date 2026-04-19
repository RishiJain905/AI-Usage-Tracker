# Task 9: Charts & Cost Tracking Views

## Objective
Build dedicated cost tracking and time-series analysis views with advanced charting, budget tracking, and cost forecasting.

## Cost View Layout

```
┌──────────────────────────────────────────────────────┐
│  Cost Tracking              Today | This Week | All Time│
├──────────┬──────────┬──────────┬──────────────────────┤
│ Today    │ This Week│ This Month│ All Time             │
│ $4.25    │ $24.50   │ $142.30  │ $1,205.80            │
│ (ALL     │ (ALL     │ (ALL     │ (ALL                 │
│  models) │  models) │  models) │  models combined)   │
├──────────┴──────────┴──────────┴──────────────────────┤
│                                                       │
│  Cost Over Time (area chart with cost overlay)        │
│  ┌─────────────────────────────────────────────┐     │
│  │  $█                                          │     │
│  │  $█  █                                      │     │
│  │  $█  █  █                                   │     │
│  │  $█  █  █  █ █                              │     │
│  │  $█  █  █  █ █ █                            │     │
│  └─────────────────────────────────────────────┘     │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                   │
│                                                       │
├─────────────────────┬────────────────────────────────┤
│ Cost by Provider    │ Cost by Model (Top 10)         │
│ (AGGREGATE)        │ (PER-MODEL separate)           │
│ ┌─────────────────┐ │ ┌────────────────────────────┐ │
│ │ OpenAI  $12.50  │ │ │ GPT-4o         $9.00      │ │
│ │ Anthropic $8.00 │ │ │ Claude 3.5      $7.00      │ │
│ │ Gemini  $4.00   │ │ │ GPT-4o Mini     $2.00      │ │
│ │ Ollama  Free    │ │ │ Gemini 1.5 Pro  $4.00      │ │
│ └─────────────────┘ │ │ ─────────────────────────── │ │
│                     │ │ TOTAL:           $24.50     │ │
├─────────────────────┴────────────────────────────────┤
│  Budget & Spending                                    │
│  ┌──────────────────────────────────────────────────┐│
│  │  Monthly Budget: $200.00                         ││
│  │  ████████░░░░░░░░░░░░  $142.30 / $200.00 (71%) ││
│  │  Projected: $185.00 (on track)                  ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Cost Per Day Breakdown (AGGREGATE — all models per day)
│  ┌──────────────────────────────────────────────────┐│
│  │  Date       Input Cost  Output Cost  Total       ││
│  │  2024-01-15 $3.50      $8.00        $11.50      ││
│  │  2024-01-14 $2.80      $6.20        $9.00       ││
│  │  2024-01-13 $4.10      $9.90        $14.00      ││
│  │                                                  ││
│  │  Toggle: [Aggregate] [Per-Model Daily]           ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## Steps

### 9.1 Build cost timeline chart

File: `src/renderer/src/components/charts/CostTimeline.tsx`

Stacked area chart showing:
- Input cost (bottom layer, blue)
- Output cost (top layer, green)
- Total cost trend line (dashed)
- Cumulative cost line (secondary Y-axis)
- Tooltip: exact costs for that day
- Period-aware: daily for week view, weekly for month view

### 9.2 Build cost breakdown by provider

File: `src/renderer/src/components/charts/CostByProvider.tsx`

- Pie/donut chart with cost distribution
- Interactive legend (click to toggle providers)
- Center text: total cost for period
- Animation on data change

### 9.3 Build cost breakdown by model

File: `src/renderer/src/components/charts/CostByModel.tsx`

Horizontal bar chart:
- Top 10 models by cost
- Color-coded by provider
- Each bar shows model name, cost, and percentage of **aggregate total**
- **Aggregate total shown at bottom** (sum of all models including "Other")
- "Other" category for models outside top 10

### 9.4 Build budget tracker component

File: `src/renderer/src/components/dashboard/BudgetTracker.tsx`

- Configurable monthly budget (set in settings)
- Progress bar: spent / budget
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Projected monthly spend based on current pace:
  ```
  projected = (current_spend / days_elapsed) * days_in_month
  ```
- Status: "On track", "Over budget", "Under budget"
- Alert threshold notifications (optional)

### 9.5 Build cost projection component

File: `src/renderer/src/components/dashboard/CostProjection.tsx`

Simple linear projection:
- Extend the usage trend line 7 days into the future (dashed line)
- Show projected total for the period
- "If current pace continues: ~$X by end of month"
- Disclaimer: "Projection based on current usage pattern"

### 9.6 Build daily cost table

File: `src/renderer/src/components/dashboard/DailyCostTable.tsx`

- Columns: Date, Input Cost, Output Cost, Total Cost, Requests, Avg Cost/Request
- **Two modes**: Aggregate (sum all models) and Per-Model (select model or show all)
- Sortable by any column
- Show trend arrows (vs previous day)
- Pagination for long date ranges
- Totals row at bottom

### 9.7 Build the cost tracking page

File: `src/renderer/src/components/dashboard/CostView.tsx`

Compose all cost components:
- Summary metric cards (Today/This Week/This Month/All Time cost) — **AGGREGATE across all models**
- Cost timeline chart — **toggle between aggregate and per-model stacked**
- Provider breakdown (aggregate) and model breakdown (per-model) — 2-column
- Budget tracker (uses aggregate cost)
- Daily cost table — **toggle between aggregate (all models sum) and per-model daily**

### 9.8 Implement usage history page

File: `src/renderer/src/components/dashboard/UsageHistory.tsx`

Full searchable, filterable log view:

```
┌──────────────────────────────────────────────────────┐
│  Usage History                                        │
│  [Search...] [Provider ▼] [Model ▼] [Date Range] [⏻]│
├──────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐│
│  │ Time     Provider  Model      Tokens  Cost  Lat ││
│  │ 10:42am  OpenAI    GPT-4o     1,250  $0.02  1.2s││
│  │ 10:38am  Anthropic Claude 3.5  890  $0.01  0.9s││
│  │ 10:30am  Ollama    Llama 3.1  2,100  Free   3.4s││
│  │ ...                                             ││
│  └──────────────────────────────────────────────────┘│
│  ← 1 2 3 ... 12 →   Showing 1-50 of 582             │
└──────────────────────────────────────────────────────┘
```

Features:
- Search: filter by model name, endpoint, etc.
- Provider filter dropdown
- Model filter dropdown
- Date range picker
- Status filter (success/error/all)
- Sortable columns
- Click row → expand to see full request/response metadata
- **Per-model breakdown column** showing which model was used
- Pagination (50 per page)
- Bulk select for export
- Real-time: new entries appear at top with subtle animation

### 9.9 Add chart theming and animations

Ensure all charts:
- Respect dark/light theme
- Animate on data changes (Recharts `isAnimationActive`)
- Are responsive (resize with window)
- Have accessible labels and legends
- Use consistent color palette per provider

Provider color palette:
```typescript
const PROVIDER_COLORS = {
  openai: '#10a37f',      // Green
  anthropic: '#d4a574',   // Tan/Orange
  ollama: '#6366f1',      // Indigo
  glm: '#3b82f6',         // Blue
  minimax: '#f59e0b',     // Amber
  gemini: '#8b5cf6',      // Purple
  mistral: '#ef4444',     // Red
  groq: '#06b6d4',        // Cyan
};
```

## Verification
- Cost timeline chart renders with stacked areas — **toggle between aggregate and per-model**
- Provider donut chart shows correct cost distribution (**aggregate totals**)
- **Model cost ranking shows per-model costs with aggregate total** at bottom
- Budget tracker shows accurate progress and projection (uses aggregate cost)
- **Daily cost table has aggregate mode and per-model mode** (toggle)
- Usage history page is searchable and filterable — **includes model column**
- All charts respect dark/light theme
- **All period selectors show: Today / This Week / This Month / All Time**
- Color palette is consistent across all visualizations
- Real-time updates reflected in cost views (both aggregate and per-model)

## Dependencies
- Task 7 (Overview & Summary Dashboard)
- Task 8 (Provider & Model Drill-Down)

## Vitest Unit Tests

**Priority**: LOW — Mostly UI/chart components. Only budget/cost projection math is worth unit-testing if extracted to a utility function.

### Optional test suites:

**Budget projection** (`src/renderer/src/lib/projection.test.ts`):
- Linear projection formula: `projected = (current_spend / days_elapsed) * days_in_month`
- Edge cases: day 1 of month (avoid division by zero), 0 spend, last day of month
- Budget threshold detection: alert at 80% of budget

> Note: Only test this if the projection logic is extracted to a standalone utility function. If it's inline in a React component, skip unit testing in favor of manual verification.

## Estimated Time
5-6 hours
