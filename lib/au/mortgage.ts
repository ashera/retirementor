// Pure helpers for a home loan carried into retirement. The engine (simulate.ts)
// layers the loan on top of the steady-state budget; these compute its cost and
// (for P&I loans) a suggested payoff age.

import type { MortgageDetail } from "./types";

/**
 * Nominal annual cash cost of the loan in today's dollars (before the engine
 * deflates it over time). P&I = the fixed repayment; interest-only = the annual
 * interest on the outstanding balance.
 */
export function mortgageAnnualCost(m: MortgageDetail): number {
  if (m.type === "interest_only") return Math.max(0, m.balance * (m.interestRate / 100));
  return Math.max(0, m.annualRepayment);
}

/**
 * Whether a P&I loan is still being repaid at a given age. Interest-only loans
 * run indefinitely (the principal never amortises), so they're always "active"
 * until cleared some other way.
 */
export function mortgageActiveAtAge(m: MortgageDetail, oldestAge: number): boolean {
  if (m.type === "interest_only") return true;
  return m.payoffAge == null || oldestAge < m.payoffAge;
}

/**
 * Outstanding NOMINAL balance after `yearsElapsed` years of repayments. An
 * interest-only loan never amortises (balance constant). A P&I loan pays down via
 * the standard amortisation recurrence Bₙ = B₀(1+r)ⁿ − M·((1+r)ⁿ−1)/r, floored at
 * 0 — so a downsize/clear part-way through the loan nets the balance actually still
 * owed, not the full original amount. Callers deflate this to today's dollars.
 */
export function outstandingBalance(m: MortgageDetail, yearsElapsed: number): number {
  if (m.type === "interest_only") return Math.max(0, m.balance);
  const n = Math.max(0, yearsElapsed);
  const M = Math.max(0, m.annualRepayment);
  const r = m.interestRate / 100;
  if (M <= 0) return Math.max(0, m.balance);
  if (r <= 0) return Math.max(0, m.balance - M * n);
  const grown = Math.pow(1 + r, n);
  return Math.max(0, m.balance * grown - (M * (grown - 1)) / r);
}

/**
 * Suggested payoff age for a P&I loan, from the standard amortisation formula:
 *   n = -ln(1 - i·B/M) / ln(1+i)   (monthly i, repayment M, balance B)
 * Returns null when the repayment doesn't even cover the interest (never
 * amortises) — the caller should treat that as effectively interest-only.
 */
export function suggestPayoffAge(
  balance: number,
  annualRatePct: number,
  annualRepayment: number,
  oldestAgeNow: number,
): number | null {
  if (balance <= 0) return oldestAgeNow;
  const M = annualRepayment / 12;
  if (M <= 0) return null;
  const i = annualRatePct / 100 / 12;
  if (i <= 0) return Math.round(oldestAgeNow + balance / M / 12);
  if (M <= i * balance) return null; // repayment ≤ interest → never pays down
  const n = -Math.log(1 - (i * balance) / M) / Math.log(1 + i);
  return Math.round(oldestAgeNow + n / 12);
}
