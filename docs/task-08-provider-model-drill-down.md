# Task 8: Provider & Model Drill-Down Views

## Objective
Build detailed views for exploring usage by provider and by model with filtering, sorting, and comparison capabilities.

## Provider View Layout

```
┌──────────────────────────────────────────────────────┐
│  By Provider              Today | This Week | All Time│
├──────────┬──────────┬──────────┬──────────────────────┤
│ OpenAI   │ Anthropic│ Ollama   │ + Add Provider      │
│ $12.50   │ $8.00    │ Free     │                     │
│ 450K tok │ 300K tok │ 200K tok │                     │
│ (AGGREGATE across all their models)                │
├──────────┴──────────┴──────────┴──────────────────────┤
│                                                       │
│  OpenAI Models Breakdown (PER-MODEL within provider) │
│  ┌──────────────────────────────────────────────────┐│
│  │  GPT-4o          GPT-4o Mini    GPT-3.5 Turbo   ││
│  │  ████░░ 65%      ██░░░░ 20%     █░░░░░ 15%      ││
│  │  320K tok $9.00  40K tok $2.00  90K tok $1.50   ││
│  │  ─────────────────────────────────────────────── ││
│  │  TOTAL: 450K tok  $12.50 (aggregate of above)   ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Provider Usage Timeline                              │
│  ┌─────────────────────────────────────────────┐     │
│  │  OpenAI vs Anthropic vs Ollama               │     │
│  │  Stacked area chart by day                   │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  All Providers Table                                  │
│  ┌──────────────────────────────────────────────────┐│
│  │ Provider  Requests  Tokens    Cost    Avg Latency││
│  │ OpenAI    180      450K     $12.50   1.2s       ││
│  │ Anthropic 95       300K     $8.00    0.9s       ││
│  │ Ollama    67       200K     Free     3.4s       ││
│  │ Gemini    20       50K      $4.00    1.1s       ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## Model View Layout

```
┌──────────────────────────────────────────────────────┐
│  By Model                Today | This Week | All Time │
├──────────────────────────────────────────────────────┤
│  Filter: [All Providers ▼] [Sort: Tokens ▼]         │
│                                                       │
│  Grand Total (ALL models combined)                   │
│  ┌──────────────────────────────────────────────────┐│
│  │ 1.2M tokens  |  $24.50 cost  |  342 requests    ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Per-Model Breakdown (EACH model separately)         │
│  ┌──────────────────────────────────────────────────┐│
│  │ GPT-4o          ████████████  320K tok  $9.00   ││
│  │ Claude 3.5      █████████     240K tok  $7.00   ││
│  │ GPT-4o Mini     ██████        130K tok  $2.00   ││
│  │ Llama 3.1       █████         100K tok  Free     ││
│  │ Gemini 1.5      ███            50K tok  $4.00   ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Model Comparison Table                               │
│  ┌──────────────────────────────────────────────────┐│
│  │ Model       Provider  In price  Out price  Usage ││
│  │ GPT-4o      OpenAI    $2.50/M   $10.00/M  320K  ││
│  │ Claude 3.5  Anthropic $3.00/M   $15.00/M  240K  ││
│  │ GPT-4o Mini OpenAI    $0.15/M   $0.60/M   130K  ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  Model Usage Over Time (PER-MODEL + AGGREGATE)         │
│  ┌─────────────────────────────────────────────┐     │
│  │  Multi-line chart with one line per model   │     │
│  │  Dashed line = aggregate total              │     │
│  │  Toggle: [Per-Model] [Aggregate Only]       │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

## Steps

### 8.1 Build provider card component

File: `src/renderer/src/components/dashboard/ProviderCard.tsx`

- Provider icon/logo
- Provider name
- Total tokens and cost for selected period
- Color-coded bar showing relative usage
- Click → expand to show model breakdown
- Status indicator (active/inactive)

### 8.2 Build provider detail panel

File: `src/renderer/src/components/dashboard/ProviderDetail.tsx`

Shown when a provider card is clicked:
- Model breakdown with horizontal bar chart (PER-MODEL within this provider)
- Model-by-model token and cost stats
- **Provider aggregate total** (sum of all its models) at the top
- Usage timeline (just this provider) — toggle between aggregate and per-model stacked
- Average latency per request
- Error rate percentage

### 8.3 Build the "By Provider" page

File: `src/renderer/src/components/dashboard/ByProvider.tsx`

- Grid of provider cards
- Comparison timeline chart (stacked area, per provider)
- Summary table with all providers
- Click provider → filter timeline and show detail panel

### 8.4 Build model ranking chart

File: `src/renderer/src/components/charts/ModelRanking.tsx`

Horizontal bar chart:
- Bars sorted by token usage (default) or cost
- Each bar shows model name, token count, cost
- Color-coded by provider
- Hover → show detailed tooltip with pricing info
- Click → navigate to model detail

### 8.5 Build model comparison table

File: `src/renderer/src/components/dashboard/ModelComparison.tsx`

Interactive data table with:
- Columns: Model, Provider, Input Price, Output Price, Total Usage, Total Cost
- Sortable by any column
- Filterable by provider
- Pagination (50 rows per page)
- Pricing format: "$2.50/M" (per million tokens)
- Usage tooltip showing prompt vs completion token split

### 8.6 Build model usage timeline

File: `src/renderer/src/components/charts/ModelTimeline.tsx`

Multi-line chart:
- One line per model (top 10 models by usage)
- **Dashed aggregate line** showing total across all visible models
- Toggle models on/off in legend
- Stacked or overlaid mode
- Show tokens or cost on Y-axis (toggle)
- **Period-aware**: adjusts x-axis for daily (today/week) or weekly (month/all-time) granularity

### 8.7 Build the "By Model" page

File: `src/renderer/src/components/dashboard/ByModel.tsx`

Compose all model components:
- Filter row (provider dropdown, sort dropdown)
- Model ranking chart
- Comparison table
- Model timeline chart

### 8.8 Implement provider/model detail modals

When clicking a specific model or provider entry:
- Show a slide-over panel or modal with:
  - **Aggregate stats** for the item (total across all sub-items)
  - Per-model breakdown (if provider) or standalone stats (if model)
  - Daily/weekly token chart for this specific item
  - Cost breakdown
  - Pricing information
  - Comparison: "This model's % of total usage across ALL models"

## Verification
- Provider cards display correctly with **aggregate totals** (sum of all their models)
- Clicking a provider shows **per-model breakdown** within that provider
- **"By Model" page shows grand total (ALL models) at top, then per-model breakdown**
- Model ranking chart is sorted and color-coded
- Model timeline chart shows **aggregate dashed line alongside per-model lines**
- Comparison table is sortable and filterable
- Detail modals/panels show **model's share of total usage** (e.g., "GPT-4o: 65% of all tokens")
- All views respect the global **Today/This Week/This Month/All Time** period selector
- Empty states shown for providers with no usage

## Dependencies
- Task 6 (Dashboard UI Foundation)
- Task 7 (Overview & Summary Dashboard)

## Estimated Time
4-5 hours
