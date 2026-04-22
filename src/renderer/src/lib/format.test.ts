import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatTokens,
  formatCost,
  formatRelativeTime,
  formatPercentage,
} from "./format";

// ─── formatTokens ──────────────────────────────────────────────────────────

describe("formatTokens", () => {
  it("formats 0", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("formats small numbers (< 1000) as-is", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands with K suffix", () => {
    expect(formatTokens(1_234)).toBe("1.23K");
    expect(formatTokens(1_500)).toBe("1.5K");
    expect(formatTokens(10_000)).toBe("10K");
    expect(formatTokens(999_999)).toBe("999.99K");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokens(1_234_567)).toBe("1.23M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(12_000_000)).toBe("12M");
  });

  it("formats billions with B suffix", () => {
    expect(formatTokens(1_234_567_890)).toBe("1.23B");
    expect(formatTokens(2_500_000_000)).toBe("2.5B");
  });

  it("formats negative numbers with - prefix", () => {
    expect(formatTokens(-999)).toBe("-999");
    expect(formatTokens(-1_234)).toBe("-1.23K");
    expect(formatTokens(-1_500_000)).toBe("-1.5M");
  });

  it("formats very large numbers", () => {
    expect(formatTokens(100_000_000_000)).toBe("100B");
  });

  it("handles fractional values under 1000", () => {
    expect(formatTokens(1.5)).toBe("1.5");
  });
});

// ─── formatCost ────────────────────────────────────────────────────────────

describe("formatCost", () => {
  it("formats 0", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats very small amounts with 4 decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
  });

  it("formats standard amounts with 2 decimal places", () => {
    expect(formatCost(0.0234)).toBe("$0.02");
    expect(formatCost(12.5)).toBe("$12.50");
    expect(formatCost(12.505)).toBe("$12.51"); // rounding
  });

  it("formats large amounts with comma separators", () => {
    expect(formatCost(1234.56)).toBe("$1,234.56");
  });

  it("formats negative numbers with - prefix", () => {
    expect(formatCost(-1.5)).toBe("-$1.50");
    expect(formatCost(-1234.56)).toBe("-$1,234.56");
  });

  it("handles very small negative amounts", () => {
    expect(formatCost(-0.001)).toBe("-$0.0010");
  });

  it("rounds correctly at boundaries", () => {
    expect(formatCost(0.009)).toBe("$0.01");
    expect(formatCost(0.0049)).toBe("$0.0049");
  });
});

// ─── formatRelativeTime ────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for < 10s", () => {
    expect(formatRelativeTime("2025-01-15T11:59:55Z")).toBe("just now");
  });

  it("returns seconds ago for < 60s", () => {
    expect(formatRelativeTime("2025-01-15T11:59:30Z")).toBe("30s ago");
  });

  it("returns minutes ago for < 3600s", () => {
    expect(formatRelativeTime("2025-01-15T11:30:00Z")).toBe("30 mins ago");
    expect(formatRelativeTime("2025-01-15T11:59:00Z")).toBe("1 min ago");
  });

  it("returns hours ago for < 86400s", () => {
    expect(formatRelativeTime("2025-01-15T10:00:00Z")).toBe("2 hrs ago");
    expect(formatRelativeTime("2025-01-15T11:00:00Z")).toBe("1 hr ago");
  });

  it("returns days ago for < 604800s", () => {
    expect(formatRelativeTime("2025-01-14T12:00:00Z")).toBe("1 day ago");
    expect(formatRelativeTime("2025-01-13T12:00:00Z")).toBe("2 days ago");
  });

  it("returns weeks ago for >= 604800s", () => {
    expect(formatRelativeTime("2025-01-08T12:00:00Z")).toBe("1 week ago");
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("2 weeks ago");
  });

  it("handles future dates", () => {
    expect(formatRelativeTime("2025-01-15T12:00:30Z")).toBe("30s from now");
  });
});

// ─── formatPercentage ──────────────────────────────────────────────────────

describe("formatPercentage", () => {
  it("formats 0", () => {
    expect(formatPercentage(0)).toBe("0%");
  });

  it("formats typical percentages", () => {
    expect(formatPercentage(12.3)).toBe("12.3%");
    expect(formatPercentage(100)).toBe("100%");
    expect(formatPercentage(0.1)).toBe("0.1%");
  });

  it("formats negative percentages", () => {
    expect(formatPercentage(-12.3)).toBe("-12.3%");
  });

  it("formats percentages > 100", () => {
    expect(formatPercentage(150)).toBe("150%");
    expect(formatPercentage(200.5)).toBe("200.5%");
  });

  it("formats whole numbers without decimals", () => {
    expect(formatPercentage(50)).toBe("50%");
  });
});
