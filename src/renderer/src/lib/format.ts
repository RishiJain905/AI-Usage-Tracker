/**
 * Format token counts with K/M suffixes.
 * 999 → "999", 1_234 → "1.2K", 1_234_567 → "1.23M", 1_500_000 → "1.5M"
 * 0 → "0", negative numbers get a "-" prefix
 */
export function formatTokens(n: number): string {
  if (n === 0) return "0";

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (abs >= 1_000_000_000) {
    const value = abs / 1_000_000_000;
    return sign + trimDecimals(value, 2) + "B";
  }
  if (abs >= 1_000_000) {
    const value = abs / 1_000_000;
    return sign + trimDecimals(value, 2) + "M";
  }
  if (abs >= 1_000) {
    const value = abs / 1_000;
    return sign + trimDecimals(value, 2) + "K";
  }

  // Integer or fractional values under 1000
  if (Number.isInteger(abs)) {
    return sign + String(abs);
  }
  return sign + String(abs);
}

/** Trim trailing zeros after toFixed, but keep at least the integer part. */
function trimDecimals(value: number, maxDecimals: number): string {
  // Use Math.floor to prevent rounding up (e.g. 999.999 → 999.99, not 1000.00)
  const factor = Math.pow(10, maxDecimals);
  const truncated = Math.floor(value * factor) / factor;
  const fixed = truncated.toFixed(maxDecimals);
  // Trim trailing zeros and trailing dot
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Format cost as USD dollar amounts.
 * 0 → "$0.00", 0.0234 → "$0.02", 12.50 → "$12.50", 1234.56 → "$1,234.56"
 * Very small amounts (< 0.01) show 4 decimal places: $0.0001
 * Negative numbers: "-$1.50"
 */
export function formatCost(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (abs === 0) return "$0.00";

  if (abs < 0.005) {
    // Very small amounts: 4 decimal places
    return sign + "$" + abs.toFixed(4);
  }

  // Standard: 2 decimal places with comma separators
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = Number(intPart).toLocaleString("en-US");
  return sign + "$" + withCommas + "." + decPart;
}

/**
 * Format relative time from an ISO date string to now.
 * "just now" for < 10s, "Xs ago" for < 60s, "X min ago" for < 3600s,
 * "X hr ago" for < 86400s, "X days ago" for < 604800s, otherwise "X weeks ago"
 * Uses Math.floor for whole numbers.
 */
export function formatRelativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);

  if (diffSec < 10) return "just now";

  const suffix = diffMs < 0 ? "from now" : "ago";

  if (diffSec < 60) return `${diffSec}s ${suffix}`;
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins} min${mins !== 1 ? "s" : ""} ${suffix}`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `${hrs} hr${hrs !== 1 ? "s" : ""} ${suffix}`;
  }
  if (diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days} day${days !== 1 ? "s" : ""} ${suffix}`;
  }
  const weeks = Math.floor(diffSec / 604800);
  return `${weeks} week${weeks !== 1 ? "s" : ""} ${suffix}`;
}

/**
 * Format a number as a percentage string.
 * 12.3 → "12.3%", 0 → "0%", 100 → "100%", 0.1 → "0.1%"
 * Negative: "-12.3%"
 */
export function formatPercentage(n: number): string {
  if (n === 0) return "0%";
  // Format to reasonable precision (up to 1 decimal, trim trailing zeros)
  const formatted =
    n % 1 === 0 ? String(n) : parseFloat(n.toFixed(1)).toString();
  return `${formatted}%`;
}
