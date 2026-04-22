/**
 * HTML Report — generate a self-contained HTML usage report with dark theme.
 */

import type { Period } from "../database/types";
import { UsageRepository, getPeriodDates } from "../database/repository";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ReportOptions {
  period?: Period;
  dateRange?: { start: string; end: string };
}

// ---------------------------------------------------------------------------
// CSS (inlined dark theme)
// ---------------------------------------------------------------------------

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    padding: 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #fafafa;
  }
  h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 32px 0 16px;
    color: #fafafa;
    border-bottom: 1px solid #262626;
    padding-bottom: 8px;
  }
  .subtitle {
    font-size: 14px;
    color: #737373;
    margin-bottom: 32px;
  }
  .card {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 20px;
  }
  .card-item {
    text-align: center;
  }
  .card-value {
    font-size: 28px;
    font-weight: 700;
    color: #fafafa;
  }
  .card-label {
    font-size: 12px;
    color: #737373;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  th, td {
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid #262626;
    font-size: 13px;
  }
  th {
    color: #a3a3a3;
    font-weight: 500;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td {
    color: #e5e5e5;
  }
  tr:hover td {
    background: #1a1a1a;
  }
  .chart-container {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .chart-title {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 16px;
    color: #a3a3a3;
  }
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 160px;
    padding-top: 8px;
  }
  .bar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }
  .bar {
    width: 100%;
    max-width: 32px;
    background: #3b82f6;
    border-radius: 4px 4px 0 0;
    min-height: 2px;
    transition: opacity 0.2s;
  }
  .bar:hover {
    opacity: 0.8;
  }
  .bar-label {
    font-size: 10px;
    color: #737373;
    margin-top: 6px;
    white-space: nowrap;
  }
  .bar-value {
    font-size: 10px;
    color: #a3a3a3;
    margin-bottom: 4px;
  }
  .empty-state {
    text-align: center;
    color: #737373;
    padding: 48px;
    font-size: 14px;
  }
  footer {
    margin-top: 48px;
    text-align: center;
    color: #525252;
    font-size: 12px;
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCost(cost: number): string {
  return "$" + cost.toFixed(4);
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateHtmlReport(
  repository: UsageRepository,
  options: ReportOptions,
): string {
  const { period, dateRange } = options;

  // Determine date range
  let startDate: string;
  let endDate: string;

  if (dateRange) {
    startDate = dateRange.start;
    endDate = dateRange.end;
  } else if (period) {
    const dates = getPeriodDates(period);
    startDate = dates.start;
    endDate = dates.end;
  } else {
    // Default to "all"
    const dates = getPeriodDates("all");
    startDate = dates.start;
    endDate = dates.end;
  }

  // Fetch data
  const effectivePeriod: Period = period ?? "all";
  const aggregate = repository.getAggregateTotal(effectivePeriod);
  const modelBreakdown = repository.getModelBreakdownForPeriod(effectivePeriod);
  const dailyTrend = repository.getUsageTrend(30);

  // -- Aggregate card --------------------------------------------------------
  const aggregateCardHtml = `
    <div class="card">
      <div class="card-item">
        <div class="card-value">${formatNumber(aggregate.request_count)}</div>
        <div class="card-label">Total Requests</div>
      </div>
      <div class="card-item">
        <div class="card-value">${formatNumber(aggregate.total_tokens)}</div>
        <div class="card-label">Total Tokens</div>
      </div>
      <div class="card-item">
        <div class="card-value">${formatCost(aggregate.total_cost)}</div>
        <div class="card-label">Total Cost</div>
      </div>
      <div class="card-item">
        <div class="card-value">${formatNumber(aggregate.prompt_tokens)}</div>
        <div class="card-label">Prompt Tokens</div>
      </div>
      <div class="card-item">
        <div class="card-value">${formatNumber(aggregate.completion_tokens)}</div>
        <div class="card-label">Completion Tokens</div>
      </div>
      <div class="card-item">
        <div class="card-value">${formatCost(aggregate.input_cost)}</div>
        <div class="card-label">Input Cost</div>
      </div>
    </div>`;

  // -- Model breakdown table --------------------------------------------------
  let modelTableHtml: string;
  if (modelBreakdown.length === 0) {
    modelTableHtml = `<div class="empty-state">No model data available for this period.</div>`;
  } else {
    const rows = modelBreakdown
      .map(
        (m) => `
      <tr>
        <td>${m.model_name}</td>
        <td>${m.provider_name}</td>
        <td>${formatNumber(m.total_tokens)}</td>
        <td>${formatCost(m.total_cost)}</td>
        <td>${formatNumber(m.request_count)}</td>
      </tr>`,
      )
      .join("");

    modelTableHtml = `
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Provider</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // -- Daily cost bar chart ---------------------------------------------------
  let chartHtml: string;
  if (dailyTrend.length === 0) {
    chartHtml = `<div class="empty-state">No daily trend data available.</div>`;
  } else {
    const maxCost = Math.max(...dailyTrend.map((d) => d.total_cost), 0.01);

    const bars = dailyTrend
      .map((d) => {
        const heightPct = (d.total_cost / maxCost) * 100;
        const dateLabel = d.date.slice(5); // MM-DD
        return `
        <div class="bar-group">
          <div class="bar-value">${formatCost(d.total_cost)}</div>
          <div class="bar" style="height: ${Math.max(heightPct, 1)}%;" title="${d.date}: ${formatCost(d.total_cost)}"></div>
          <div class="bar-label">${dateLabel}</div>
        </div>`;
      })
      .join("");

    chartHtml = `
      <div class="chart-container">
        <div class="chart-title">Daily Cost (Last 30 Days)</div>
        <div class="bar-chart">${bars}</div>
      </div>`;
  }

  // -- Assemble full HTML -----------------------------------------------------
  const periodLabel = period
    ? period.charAt(0).toUpperCase() + period.slice(1)
    : "All Time";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Usage Tracker — Usage Report</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>AI Usage Tracker — Usage Report</h1>
  <div class="subtitle">Period: ${periodLabel} (${startDate} to ${endDate}) &middot; Generated ${new Date().toISOString().slice(0, 10)}</div>

  <h2>Aggregate Summary</h2>
  ${aggregateCardHtml}

  <h2>Model Breakdown</h2>
  ${modelTableHtml}

  <h2>Daily Cost Timeline</h2>
  ${chartHtml}

  <footer>Generated by AI Usage Tracker</footer>
</body>
</html>`;

  return html;
}
