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

/** CGT on sale — 50% discount (held > 12 months), in today's dollars. */
export function capitalGainsTax(p: PropertyDetail, value: number): number {
  const gain = Math.max(0, value - p.purchasePrice);
  return incomeTax(gain * 0.5);
}

/** Cash released by a sale: value, less the loan repaid and CGT. */
export function netSaleProceeds(p: PropertyDetail, value: number): number {
  return Math.max(0, value - p.loanBalance - capitalGainsTax(p, value));
}
