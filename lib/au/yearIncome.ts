// Where a retirement year's spending money comes from, by source — the single
// source of truth behind the income year-breakdown modal. Kept pure (takes a
// YearRow) so it can be unit-tested: the sources must sum to `total`, and in a
// funded year the total reconciles with what was spent. Extracting this stops the
// class of bug where a new income source (e.g. part-time work) is added to the
// engine + chart but forgotten in the modal's total.

import type { YearRow } from "./types";

export interface RetirementYearIncome {
  pension: number; // Age Pension received
  netRent: number; // investment-property net rent after its income tax (negative for a geared loss)
  partnerSalary: number; // a still-working partner's take-home (staggered-retirement gap)
  partTimeWork: number; // the retiree's own part-time work income (the workIncome feature), net of tax
  incomeStream: number; // recurring income stream (DB/annuity/foreign pension), net of tax
  fromSuper: number; // super that actually FUNDS spending (a mandatory-minimum surplus is reinvested, not spent)
  fromOutside: number; // drawn from outside-super savings
  superReinvested: number; // ATO-minimum super drawn beyond the need and reinvested this year
  need: number; // spending still to fund from savings after ALL income sources
  total: number; // sum of every income source — reconciles with `row.spending` in a funded year
}

/** Income sources for a retirement-phase row. Accumulation rows return all zeros. */
export function retirementYearIncome(row: YearRow): RetirementYearIncome {
  const zero: RetirementYearIncome = {
    pension: 0, netRent: 0, partnerSalary: 0, partTimeWork: 0, incomeStream: 0,
    fromSuper: 0, fromOutside: 0, superReinvested: 0, need: 0, total: 0,
  };
  if (row.phase === "accumulation") return zero;

  const pension = row.agePension;
  const netRent = (row.rentIncome ?? 0) - (row.breakdown.rentTax ?? 0);
  const partnerSalary = row.salaryIncome > 1 ? row.breakdown.takeHome : 0;
  const partTimeWork = Math.max(0, row.workIncome ?? 0);
  const incomeStream = Math.max(0, row.incomeStream ?? 0);
  const fromOutside = row.outsideDrawn;
  const drawnSuper = row.superDrawn;

  // Spending left to fund from savings after EVERY income source (incl. part-time
  // work + income streams). The ATO minimum can push super out beyond this — that
  // surplus is reinvested, not spent, so it isn't spendable income this year.
  const need = Math.max(0, row.spending - pension - netRent - partnerSalary - partTimeWork - incomeStream);
  const superReinvested = Math.max(0, drawnSuper - need);
  const fromSuper = drawnSuper - superReinvested;

  const total = pension + netRent + fromSuper + fromOutside + partnerSalary + partTimeWork + incomeStream;
  return { pension, netRent, partnerSalary, partTimeWork, incomeStream, fromSuper, fromOutside, superReinvested, need, total };
}
