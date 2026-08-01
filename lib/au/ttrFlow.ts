// One year's Transition-to-Retirement "flow of funds", reconstructed from a
// simulated row for the reusable TTR flow diagram. Everything derives from the two
// TTR fields the engine records — ttrPension and ttrBenefit — which together pin the
// sacrificed slice: the net contribution into super is (1 − 15%)·slice, and that
// equals ttrBenefit (kept in super) + ttrPension (drawn back out to hold take-home).

import type { YearRow } from "./types";

export interface TtrFlow {
  salary: number; // gross wage(s) the year is built on (household in a couple)
  slice: number; // extra pay sacrificed into super via TTR
  contribTax: number; // 15% super contributions tax on the slice
  netToSuper: number; // slice − contribTax
  taxablePay: number; // the rest of the salary (salary − slice)
  incomeTax: number; // income tax + Medicare on the taxable pay (with TTR)
  salaryTakeHome: number; // take-home from salary alone (before the TTR pension tops it up)
  pension: number; // tax-free TTR pension drawn from super to hold take-home
  superKept: number; // net gain retained in super (= ttrBenefit)
  takeHome: number; // held take-home (salaryTakeHome + pension)
  taxSaved: number; // marginal income tax + Medicare saved on the slice
  marginalPct: number; // implied marginal rate on the slice
}

const DEFAULT_CONTRIB_TAX = 0.15;

/** Reconstruct a year's TTR flow from a simulated row. Null in a year with no TTR. */
export function ttrFlowFromRow(row: YearRow, contribTaxRate: number = DEFAULT_CONTRIB_TAX): TtrFlow | null {
  const b = row.breakdown;
  const pension = Math.max(0, b.ttrPension ?? 0);
  const superKept = b.ttrBenefit ?? 0;
  const netToSuper = superKept + pension; // = (1 − rate)·slice
  if (netToSuper <= 1) return null; // no active TTR this year
  const slice = netToSuper / (1 - contribTaxRate);
  const contribTax = slice - netToSuper;
  const taxSaved = slice - pension; // pension = the slice's after-marginal-tax value = slice − taxSaved
  const takeHome = row.takeHome || b.takeHome || 0;
  const salaryTakeHome = Math.max(0, takeHome - pension);
  const salary = Math.max(row.salaryIncome || 0, slice + salaryTakeHome);
  const taxablePay = Math.max(0, salary - slice);
  const incomeTax = Math.max(0, taxablePay - salaryTakeHome);
  const marginalPct = slice > 0 ? Math.round((taxSaved / slice) * 100) : 0;
  return { salary, slice, contribTax, netToSuper, taxablePay, incomeTax, salaryTakeHome, pension, superKept, takeHome, taxSaved, marginalPct };
}

/** A representative example (a $130k earner sacrificing $15k at 60), for the
 *  knowledge-base article where there's no specific plan. Real engine figures. */
export const TTR_FLOW_EXAMPLE: TtrFlow = {
  salary: 130_000, slice: 15_000, contribTax: 2_250, netToSuper: 12_750, taxablePay: 115_000,
  incomeTax: 27_320, salaryTakeHome: 87_680, pension: 10_200, superKept: 2_550, takeHome: 97_880,
  taxSaved: 4_800, marginalPct: 32,
};
