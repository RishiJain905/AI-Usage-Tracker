import { describe, it, expect } from "vitest";
import {
  calculateProjection,
  getBudgetStatus,
  getDaysElapsedInMonth,
  getDaysInMonth,
} from "./projection";

// ─── calculateProjection ───────────────────────────────────────────────────

describe("calculateProjection", () => {
  it("projects typical values (day 15, $100 spent, 30-day month → $200)", () => {
    expect(calculateProjection(100, 15, 30)).toBe(200);
  });

  it("returns currentSpend * daysInMonth on day 1 to avoid div-by-zero", () => {
    expect(calculateProjection(50, 0, 30)).toBe(1500);
  });

  it("returns 0 projected when currentSpend is 0", () => {
    expect(calculateProjection(0, 15, 30)).toBe(0);
  });

  it("returns currentSpend on last day of month", () => {
    expect(calculateProjection(100, 30, 30)).toBe(100);
  });
});

// ─── getBudgetStatus ───────────────────────────────────────────────────────

describe("getBudgetStatus", () => {
  it("returns 'disabled' when budget is 0", () => {
    expect(getBudgetStatus(50, 0)).toBe("disabled");
  });

  it("returns 'disabled' when budget is negative", () => {
    expect(getBudgetStatus(50, -10)).toBe("disabled");
  });

  it("returns 'under' when spend is under 50%", () => {
    expect(getBudgetStatus(40, 100)).toBe("under");
  });

  it("returns 'on-track' at 65%", () => {
    expect(getBudgetStatus(65, 100)).toBe("on-track");
  });

  it("returns 'over' at 85%", () => {
    expect(getBudgetStatus(85, 100)).toBe("over");
  });
});

// ─── getDaysElapsedInMonth ─────────────────────────────────────────────────

describe("getDaysElapsedInMonth", () => {
  it("returns a number >= 1", () => {
    const result = getDaysElapsedInMonth();
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(31);
  });
});

// ─── getDaysInMonth ────────────────────────────────────────────────────────

describe("getDaysInMonth", () => {
  it("returns 28-31", () => {
    const result = getDaysInMonth();
    expect(result).toBeGreaterThanOrEqual(28);
    expect(result).toBeLessThanOrEqual(31);
  });
});
