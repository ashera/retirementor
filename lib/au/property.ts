// Pure helpers for an investment property held into / through retirement. Unlike
// the family home, an investment property is ASSESSABLE for the Age Pension: its
// NET EQUITY (value minus the loan secured against it) counts under the assets
// test, and its ACTUAL net rent counts under the income test (it is NOT deemed).
// The secured loan is modelled as interest-only (balance constant, value grows).

import { incomeTax } from "./tax";
import type { PropertyDetail } from "./types";

/** Market value grown at its real rate, `yearsFromNow` years out (today's $). */
export function propertyValueAt(p: PropertyDetail, yearsFromNow: number): number {
  return p.value * Math.pow(1 + p.growthReal / 100, yearsFromNow);
}

/** Gross annual rent at a given value. */
export function grossRent(p: PropertyDetail, value: number): number {
  return value * (p.grossYield / 100);
}

/** Rent after operating costs & vacancy (before loan interest). */
export function netOperatingIncome(p: PropertyDetail, value: number): number {
  return grossRent(p, value) * (1 - p.costRatio / 100);
}

/** Annual interest on the secured loan (interest-only). */
export function loanInterest(p: PropertyDetail): number {
  return p.loanBalance * (p.loanRate / 100);
}

/** Net cash the property throws off each year — can be negative if geared. */
export function netRentCash(p: PropertyDetail, value: number): number {
  return netOperatingIncome(p, value) - loanInterest(p);
}

/** Actual net rent counted under the Age Pension income test (floored at $0). */
export function incomeTestRent(p: PropertyDetail, value: number): number {
  return Math.max(0, netOperatingIncome(p, value) - loanInterest(p));
}

/** Assessable net equity (value less the loan secured against it). */
export function netEquity(p: PropertyDetail, value: number): number {
  return Math.max(0, value - p.loanBalance);
}

// How a realised capital gain is taxed. Mirrors config.outsideTax so property and
// outside-super gains use the same rules. Standalone here (the gain isn't stacked on
// other income — a documented single-taxpayer simplification).
export interface CgtRules {
  regime: "indexed" | "discount";
  discountPct: number; // "discount" regime: fraction of the gain excluded (e.g. 50)
  minRatePct: number; // "indexed" regime: minimum tax rate on the real gain (e.g. 30)
  onAgePension: boolean; // Age Pension recipients are exempt from the 30% minimum
}

// Pre-2027 default so callers without engine context (illustrative notes, older
// tests) keep the historical behaviour unless they opt into the reform.
export const DISCOUNT_CGT_RULES: CgtRules = { regime: "discount", discountPct: 50, minRatePct: 30, onAgePension: false };

/** CGT on sale, in today's dollars. "discount" = 50% discount then marginal;
 *  "indexed" (post-1 July 2027) = the whole real gain at the marginal rate with a
 *  30% minimum (Age Pension recipients exempt from the minimum).
 *  A jointly-owned property splits the gain across `owners`, so each co-owner is
 *  taxed on their share on their own scale — a couple isn't taxed as one big gain.
 *  (Still standalone per owner — not stacked on their other income — a documented
 *  simplification.) */
export function capitalGainsTax(
  p: PropertyDetail,
  value: number,
  rules: CgtRules = DISCOUNT_CGT_RULES,
  owners = 1,
): number {
  const gain = Math.max(0, value - p.purchasePrice);
  if (gain <= 0) return 0;
  const n = Math.max(1, Math.round(owners));
  const gainPer = gain / n;
  const perOwner =
    rules.regime === "discount"
      ? incomeTax(gainPer * (1 - rules.discountPct / 100))
      : rules.onAgePension
        ? incomeTax(gainPer) // real gain, fully taxable
        : Math.max(incomeTax(gainPer), (rules.minRatePct / 100) * gainPer);
  return perOwner * n;
}

/** Cash released by a sale: value, less the loan repaid and CGT. */
export function netSaleProceeds(p: PropertyDetail, value: number, rules: CgtRules = DISCOUNT_CGT_RULES): number {
  return Math.max(0, value - p.loanBalance - capitalGainsTax(p, value, rules));
}
