// Withdrawal-rate diagnostic — the share of the super balance drawn each year
// (super drawn ÷ start-of-year super balance). A read-out derived from the
// existing projection; it does not change the engine. The headline is the first
// year super is actually drawn (super is locked before preservation age, so an
// early retiree's rate only "starts" once it unlocks).

import type { SimResult, YearRow } from "./types";

export function rowWithdrawalRate(row: YearRow): number {
  return row.totalSuper > 0 ? row.superDrawn / row.totalSuper : 0;
}

export interface InitialWithdrawal {
  rate: number; // fraction, e.g. 0.052
  age: number;
  drawn: number; // $ drawn from super that year
  balance: number; // start-of-year super balance
  // Funding context — why the super draw differs from the headline spend:
  spend: number; // total spending that year
  agePension: number; // Age Pension funding part of the spend
  rent: number; // net investment-property rent funding part (≥ 0)
  outsideDrawn: number; // drawn from outside-super savings
  minDriven: boolean; // true when the ATO minimum forces a draw above the spending need
}

/** The first drawdown year's rate — the standard "initial withdrawal rate". */
export function initialWithdrawal(result: SimResult): InitialWithdrawal | null {
  const row = result.rows.find((r) => r.phase !== "accumulation" && r.superDrawn > 0 && r.totalSuper > 0);
  if (!row) return null;
  const b = row.breakdown;
  const spend = b.livingSpend + b.mortgageCost;
  const agePension = b.agePension;
  const rent = Math.max(0, b.rentIncome);
  const need = Math.max(0, spend - agePension - rent); // the slice super must fund
  return {
    rate: rowWithdrawalRate(row),
    age: row.age,
    drawn: row.superDrawn,
    balance: row.totalSuper,
    spend,
    agePension,
    rent,
    outsideDrawn: row.outsideDrawn,
    minDriven: row.superDrawn > need + 1,
  };
}

export type WithdrawalBand = { label: string; tone: "accent" | "amber" | "red" };

/** Rough guidance bands (the classic 4% anchor). The Age Pension backstop means
 *  higher rates can still last — the Monte-Carlo likelihood is the real test. */
export function withdrawalBand(rate: number): WithdrawalBand {
  if (rate <= 0.04) return { label: "conservative", tone: "accent" };
  if (rate <= 0.06) return { label: "moderate", tone: "amber" };
  return { label: "high", tone: "red" };
}
