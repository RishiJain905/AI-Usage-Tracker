import { getDaysInMonth as dateFnsGetDaysInMonth, getDate } from "date-fns";

/**
 * Calculate projected monthly spend based on current pace.
 * projected = (currentSpend / daysElapsed) * daysInMonth
 * Returns 0 if daysElapsed is 0.
 */
export function calculateProjection(
  currentSpend: number,
  daysElapsed: number,
  daysInMonth: number,
): number {
  if (daysElapsed === 0) return currentSpend * daysInMonth;
  return (currentSpend / daysElapsed) * daysInMonth;
}

/**
 * Get budget status based on percentage used.
 * < 50% → 'under', 50-80% → 'on-track', > 80% → 'over'
 * Returns 'disabled' if budget is 0 or negative.
 */
export function getBudgetStatus(
  currentSpend: number,
  budget: number,
): "under" | "on-track" | "over" | "disabled" {
  if (budget <= 0) return "disabled";
  const percentage = (currentSpend / budget) * 100;
  if (percentage < 50) return "under";
  if (percentage <= 80) return "on-track";
  return "over";
}

/**
 * Get days elapsed in the current month (1-indexed, minimum 1 for projection guard).
 */
export function getDaysElapsedInMonth(): number {
  return Math.max(1, getDate(new Date()));
}

/**
 * Get total days in the current month.
 */
export function getDaysInMonth(): number {
  return dateFnsGetDaysInMonth(new Date());
}
